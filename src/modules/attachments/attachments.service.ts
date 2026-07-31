import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { Connection, Model, Types, mongo } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { TicketsService } from '../tickets/tickets.service';
import {
  AttachmentFilePolicyService,
  UploadedAttachment,
} from './attachment-file-policy.service';
import { AttachmentStatus } from './attachment-status.enum';
import { Attachment, AttachmentDocument } from './schemas/attachment.schema';
import { ListAttachmentsDto } from './dto/list-attachments.dto';

export interface AttachmentDownload {
  metadata: AttachmentDocument;
  stream: mongo.GridFSBucketReadStream;
}

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(Attachment.name)
    private readonly attachmentModel: Model<AttachmentDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly ticketsService: TicketsService,
    private readonly filePolicy: AttachmentFilePolicyService,
    private readonly auditService: AuditService,
  ) {}

  async upload(
    ticketId: string,
    file: UploadedAttachment,
    actor: AuthenticatedUser,
  ): Promise<AttachmentDocument> {
    await this.ticketsService.findOne(ticketId, actor);
    const validated = this.filePolicy.validate(file);
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const existing = await this.attachmentModel
      .findOne({ ticketId: new Types.ObjectId(ticketId), checksumSha256 })
      .exec();
    if (existing) {
      return existing;
    }
    const bucket = this.getBucket();
    const fileId = await new Promise<mongo.ObjectId>((resolve, reject) => {
      const upload = bucket.openUploadStream(`${ticketId}-${Date.now()}`, {
        contentType: validated.mimeType,
        metadata: {
          ticketId,
          uploadedBy: actor.sub,
          checksumSha256,
        },
      });
      upload.once('error', reject);
      upload.once('finish', () => resolve(upload.id));
      Readable.from(file.buffer).pipe(upload);
    });

    try {
      const metadata = await this.attachmentModel.create({
        fileId: new Types.ObjectId(fileId.toHexString()),
        ticketId: new Types.ObjectId(ticketId),
        uploadedBy: new Types.ObjectId(actor.sub),
        originalName: validated.originalName,
        mimeType: validated.mimeType,
        size: file.size,
        checksumSha256,
        status: AttachmentStatus.CONTENT_VALIDATED,
      });
      await this.auditService.record({
        actorId: actor.sub,
        action: 'ATTACHMENT_UPLOADED',
        resourceType: 'ticket',
        resourceId: ticketId,
        metadata: {
          attachmentId: metadata.id,
          mimeType: metadata.mimeType,
          size: metadata.size,
          checksumSha256,
        },
      }).catch(() => undefined);
      return metadata;
    } catch (error) {
      await bucket.delete(fileId).catch(() => undefined);
      if (this.isDuplicateKeyError(error)) {
        const duplicate = await this.attachmentModel
          .findOne({ ticketId: new Types.ObjectId(ticketId), checksumSha256 })
          .exec();
        if (duplicate) {
          return duplicate;
        }
      }
      throw error;
    }
  }

  async list(
    ticketId: string,
    actor: AuthenticatedUser,
    query: ListAttachmentsDto,
  ) {
    await this.ticketsService.findOne(ticketId, actor);
    const filter = { ticketId: new Types.ObjectId(ticketId) };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.attachmentModel
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.attachmentModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  }

  async download(id: string, actor: AuthenticatedUser): Promise<AttachmentDownload> {
    const metadata = await this.attachmentModel.findById(id).exec();
    if (!metadata) {
      throw new NotFoundException('Attachment not found.');
    }
    if (metadata.status !== AttachmentStatus.CONTENT_VALIDATED) {
      throw new NotFoundException('Attachment is not available.');
    }
    await this.ticketsService.findOne(metadata.ticketId.toString(), actor);
    return {
      metadata,
      stream: this.getBucket().openDownloadStream(
        new mongo.ObjectId(metadata.fileId.toString()),
      ),
    };
  }

  private getBucket(): mongo.GridFSBucket {
    if (!this.connection.db) {
      throw new ServiceUnavailableException('File storage is unavailable.');
    }
    return new mongo.GridFSBucket(this.connection.db, { bucketName: 'attachments' });
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
