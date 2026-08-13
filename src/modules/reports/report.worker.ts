import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Job } from 'bullmq';
import { Readable } from 'node:stream';
import PDFDocument from 'pdfkit';
import { Connection, FilterQuery, Model, mongo } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { DeadLetterService } from '../jobs/dead-letter.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema';
import { TicketPriority } from '../tickets/ticket-priority.enum';
import { TicketStatus } from '../tickets/ticket-status.enum';
import { ReportStatus } from './report-status.enum';
import { REPORTS_QUEUE } from './reports.constants';
import { Report, ReportDocument } from './schemas/report.schema';

interface ReportJob {
  reportId: string;
  actorId: string;
}

interface ReportFilters {
  status?: TicketStatus;
  priority?: TicketPriority;
  maxRows: number;
}

@Processor(REPORTS_QUEUE, { concurrency: 2 })
export class ReportWorker extends WorkerHost {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly deadLetterService: DeadLetterService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ReportJob>): Promise<{ fileId: string }> {
    const report = await this.reportModel.findById(job.data.reportId).exec();
    if (!report) {
      throw new Error('Report no longer exists.');
    }
    if (report.status === ReportStatus.COMPLETED && report.fileId) {
      return { fileId: report.fileId.toString() };
    }
    if (!this.connection.db) {
      throw new Error('Report storage is unavailable.');
    }

    report.status = ReportStatus.PROCESSING;
    report.error = undefined;
    await report.save();
    const filters = this.parseFilters(report.filters);
    const query: FilterQuery<TicketDocument> = {};
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    const tickets = await this.ticketModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters.maxRows)
      .lean()
      .exec();
    const pdf = await this.renderPdf(tickets, filters);
    const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'reports' });
    const fileId = await new Promise<mongo.ObjectId>((resolve, reject) => {
      const upload = bucket.openUploadStream(`tickets-${report.id}.pdf`, {
        contentType: 'application/pdf',
        metadata: { reportId: report.id, requestedBy: report.requestedBy.toString() },
      });
      upload.once('error', reject);
      upload.once('finish', () => resolve(upload.id));
      Readable.from(pdf).pipe(upload);
    });

    try {
      report.fileId = fileId;
      report.status = ReportStatus.COMPLETED;
      report.completedAt = new Date();
      report.expiresAt ??= new Date(
        Date.now() + (this.configService.get<number>('pdfRetentionDays') ?? 30) * 86_400_000,
      );
      await report.save();
    } catch (error) {
      await bucket.delete(fileId).catch(() => undefined);
      throw error;
    }

    await Promise.allSettled([
      this.auditService.record({
        actorId: job.data.actorId,
        action: 'REPORT_COMPLETED',
        resourceType: 'report',
        resourceId: report.id,
        metadata: { rows: tickets.length },
      }),
      this.notificationsService.create({
        userId: report.requestedBy.toString(),
        type: 'REPORT_COMPLETED',
        title: 'Ticket report ready',
        message: 'Your PDF report is ready to download.',
        resourceType: 'report',
        resourceId: report.id,
      }),
    ]);
    return { fileId: fileId.toHexString() };
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ReportJob> | undefined, error: Error): Promise<void> {
    if (!job) {
      return;
    }
    await this.deadLetterService.capture(REPORTS_QUEUE, job, error);
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      await this.reportModel.updateOne(
        { _id: job.data.reportId },
        {
          $set: {
            status: ReportStatus.DEAD_LETTER,
            error: error.message.slice(0, 2_000),
          },
        },
      );
    }
  }

  private parseFilters(filters: Record<string, unknown>): ReportFilters {
    const status = Object.values(TicketStatus).includes(filters.status as TicketStatus)
      ? (filters.status as TicketStatus)
      : undefined;
    const priority = Object.values(TicketPriority).includes(
      filters.priority as TicketPriority,
    )
      ? (filters.priority as TicketPriority)
      : undefined;
    const maxRows =
      typeof filters.maxRows === 'number'
        ? Math.min(Math.max(Math.floor(filters.maxRows), 1), 2_000)
        : 500;
    return { status, priority, maxRows };
  }

  private async renderPdf(
    tickets: Array<Record<string, unknown>>,
    filters: ReportFilters,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: 'Secure Service Desk — Ticket Report' },
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.once('error', reject);
      document.once('end', () => resolve(Buffer.concat(chunks)));
      document.fontSize(18).text('Secure Service Desk — Ticket Report');
      document.moveDown(0.5);
      document
        .fontSize(9)
        .text(
          `Generated: ${new Date().toISOString()} | Status: ${filters.status ?? 'ALL'} | Priority: ${filters.priority ?? 'ALL'}`,
        );
      document.moveDown();
      if (tickets.length === 0) {
        document.fontSize(11).text('No tickets matched the selected filters.');
      }
      for (const ticket of tickets) {
        document
          .fontSize(11)
          .text(
            `${String(ticket.number)} — ${String(ticket.subject)}`,
            { continued: false },
          );
        document
          .fontSize(9)
          .fillColor('#444444')
          .text(
            `Status: ${String(ticket.status)} | Priority: ${String(ticket.priority)} | Updated: ${String(ticket.updatedAt)}`,
          )
          .fillColor('#000000');
        document.moveDown(0.5);
      }
      document.end();
    });
  }
}
