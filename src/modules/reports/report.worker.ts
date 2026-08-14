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
import { sanitizeSensitiveData } from '../../common/security/sanitize-sensitive-data';

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
    const processingJobId = String(job.id ?? `report-${job.data.reportId}`);
    const claimed = await this.claimReport(job.data.reportId, processingJobId);
    if (claimed.fileId !== undefined) return { fileId: claimed.fileId };
    const report = claimed.report;
    if (!report) throw new Error('Report is not available for processing.');
    if (!this.connection.db) {
      throw new Error('Report storage is unavailable.');
    }

    const filters = this.parseFilters(report.filters);
    const tickets = await this.loadTickets(filters);
    const pdf = await this.renderPdf(tickets, filters);
    const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'reports' });
    const fileId = await this.storePdf(bucket, report, pdf);
    await this.completeReport(report, processingJobId, fileId, bucket);
    await this.notifyReport(job.data.actorId, report, tickets.length);
    return { fileId: fileId.toHexString() };
  }

  private async claimReport(
    reportId: string,
    processingJobId: string,
  ): Promise<{ report?: ReportDocument; fileId?: string }> {
    const report = await this.reportModel
      .findOneAndUpdate(
        { _id: reportId, status: ReportStatus.QUEUED },
        {
          $set: { status: ReportStatus.PROCESSING, processingJobId, processingAt: new Date() },
          $unset: { error: 1 },
        },
        { new: true },
      )
      .exec();
    if (report) return { report };
    const current = await this.reportModel.findById(reportId).exec();
    if (!current) throw new Error('Report no longer exists.');
    if (current.status === ReportStatus.COMPLETED && current.fileId) {
      return { fileId: current.fileId.toString() };
    }
    if (current.status === ReportStatus.PROCESSING) {
      return { fileId: current.fileId?.toString() ?? '' };
    }
    throw new Error('Report is not available for processing.');
  }

  private async loadTickets(filters: ReportFilters): Promise<Array<Record<string, unknown>>> {
    const query: FilterQuery<TicketDocument> = {};
    if (filters.status) query.status = filters.status;
    if (filters.priority) query.priority = filters.priority;
    return this.ticketModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters.maxRows)
      .lean()
      .exec();
  }

  private async storePdf(
    bucket: mongo.GridFSBucket,
    report: ReportDocument,
    pdf: Buffer,
  ): Promise<mongo.ObjectId> {
    return new Promise<mongo.ObjectId>((resolve, reject) => {
      const upload = bucket.openUploadStream(`tickets-${report.id}.pdf`, {
        contentType: 'application/pdf',
        metadata: { reportId: report.id, requestedBy: report.requestedBy.toString() },
      });
      upload.once('error', reject);
      upload.once('finish', () => resolve(upload.id));
      Readable.from(pdf).pipe(upload);
    });
  }

  private async completeReport(
    report: ReportDocument,
    processingJobId: string,
    fileId: mongo.ObjectId,
    bucket: mongo.GridFSBucket,
  ): Promise<void> {
    try {
      const expiresAt =
        report.expiresAt ??
        new Date(
          Date.now() + (this.configService.get<number>('pdfRetentionDays') ?? 30) * 86_400_000,
        );
      const completion = await this.reportModel
        .updateOne(
          { _id: report._id, status: ReportStatus.PROCESSING, processingJobId },
          {
            $set: { fileId, status: ReportStatus.COMPLETED, completedAt: new Date(), expiresAt },
            $unset: { processingJobId: 1, processingAt: 1, error: 1 },
          },
        )
        .exec();
      if (completion.modifiedCount !== 1) throw new Error('Report claim was lost.');
    } catch (error) {
      await bucket.delete(fileId).catch(() => undefined);
      throw error;
    }
  }

  private async notifyReport(actorId: string, report: ReportDocument, rows: number): Promise<void> {
    await Promise.allSettled([
      this.auditService.record({
        actorId,
        action: 'REPORT_COMPLETED',
        resourceType: 'report',
        resourceId: report.id,
        metadata: { rows },
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
        {
          _id: job.data.reportId,
          status: ReportStatus.PROCESSING,
          processingJobId: String(job.id),
        },
        {
          $set: {
            status: ReportStatus.DEAD_LETTER,
            error: sanitizeSensitiveData(error.message, { maxStringLength: 2_000 }) as string,
          },
          $unset: { processingJobId: 1, processingAt: 1 },
        },
      );
      return;
    }
    await this.reportModel.updateOne(
      { _id: job.data.reportId, status: ReportStatus.PROCESSING, processingJobId: String(job.id) },
      {
        $set: { status: ReportStatus.QUEUED },
        $unset: { processingJobId: 1, processingAt: 1, error: 1 },
      },
    );
  }

  private parseFilters(filters: Record<string, unknown>): ReportFilters {
    const status = Object.values(TicketStatus).includes(filters.status as TicketStatus)
      ? (filters.status as TicketStatus)
      : undefined;
    const priority = Object.values(TicketPriority).includes(filters.priority as TicketPriority)
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
          .text(`${String(ticket.number)} — ${String(ticket.subject)}`, { continued: false });
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
