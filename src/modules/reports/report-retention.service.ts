import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, mongo } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';
import { ReportStatus } from './report-status.enum';

@Injectable()
export class ReportRetentionService implements OnApplicationBootstrap, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(ReportRetentionService.name);

  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.purgeExpiredFiles();
    const interval = this.configService.get<number>('queueRecoveryIntervalMs') ?? 60_000;
    this.timer = setInterval(() => void this.purgeExpiredFiles(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async purgeExpiredFiles(): Promise<number> {
    if (!this.connection.db) return 0;
    const reports = await this.reportModel
      .find({
        status: ReportStatus.COMPLETED,
        fileId: { $exists: true },
        expiresAt: { $lte: new Date() },
      })
      .sort({ expiresAt: 1 })
      .limit(100)
      .exec();
    if (reports.length === 0) return 0;

    const bucket = new mongo.GridFSBucket(this.connection.db, { bucketName: 'reports' });
    let purged = 0;
    for (const report of reports) {
      if (!report.fileId) continue;
      await bucket.delete(new mongo.ObjectId(report.fileId.toString())).catch(() => undefined);
      await this.reportModel.updateOne(
        { _id: report._id, status: ReportStatus.COMPLETED },
        { $set: { status: ReportStatus.PURGED, purgedAt: new Date() }, $unset: { fileId: 1 } },
      ).exec();
      purged += 1;
    }
    if (purged > 0) this.logger.log(`Purged ${purged} expired report file(s).`);
    return purged;
  }
}
