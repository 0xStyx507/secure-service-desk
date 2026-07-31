import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Connection, Model, mongo, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateTicketReportDto } from './dto/create-ticket-report.dto';
import { ReportStatus } from './report-status.enum';
import { REPORTS_QUEUE } from './reports.constants';
import { Report, ReportDocument } from './schemas/report.schema';

export interface ReportDownload {
  report: ReportDocument;
  stream: mongo.GridFSBucketReadStream;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectQueue(REPORTS_QUEUE)
    private readonly queue: Queue,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly auditService: AuditService,
  ) {}

  async create(
    dto: CreateTicketReportDto,
    actor: AuthenticatedUser,
  ): Promise<ReportDocument> {
    const report = await this.reportModel.create({
      requestedBy: new Types.ObjectId(actor.sub),
      type: 'TICKETS',
      filters: {
        status: dto.status,
        priority: dto.priority,
        maxRows: dto.maxRows,
      },
      status: ReportStatus.QUEUED,
    });
    await this.auditService.record({
      actorId: actor.sub,
      action: 'REPORT_REQUESTED',
      resourceType: 'report',
      resourceId: report.id,
      metadata: { type: report.type, filters: report.filters },
    }).catch(() => undefined);

    try {
      await this.queue.add(
        'generate-ticket-pdf',
        { reportId: report.id, actorId: actor.sub },
        {
          jobId: `report-${report.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000, jitter: 0.25 },
          removeOnComplete: 500,
          removeOnFail: false,
        },
      );
    } catch {
      // QUEUED remains a durable recovery marker when Redis is unavailable.
    }
    return report;
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<ReportDocument> {
    const report = await this.reportModel.findById(id).exec();
    if (!report) {
      throw new NotFoundException('Report not found.');
    }
    if (report.requestedBy.toString() !== actor.sub) {
      throw new ForbiddenException('You cannot access this report.');
    }
    return report;
  }

  async download(id: string, actor: AuthenticatedUser): Promise<ReportDownload> {
    const report = await this.findOne(id, actor);
    if (report.status !== ReportStatus.COMPLETED || !report.fileId) {
      throw new NotFoundException('Report file is not available.');
    }
    if (!this.connection.db) {
      throw new NotFoundException('Report file is not available.');
    }
    const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'reports' });
    return {
      report,
      stream: bucket.openDownloadStream(new mongo.ObjectId(report.fileId.toString())),
    };
  }
}
