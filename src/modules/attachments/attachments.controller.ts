import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ParseMongoIdPipe } from '../../common/pipes/parse-mongo-id.pipe';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadedAttachment } from './attachment-file-policy.service';
import { MAX_ATTACHMENT_BYTES } from './attachments.constants';
import { AttachmentsService } from './attachments.service';
import { ListAttachmentsDto } from './dto/list-attachments.dto';

@ApiTags('attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('tickets/:ticketId/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
    }),
  )
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Attach a validated JPEG or PNG image to a visible ticket' })
  upload(
    @Param('ticketId', ParseMongoIdPipe) ticketId: string,
    @UploadedFile() file: UploadedAttachment | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('Attachment file is required.');
    }
    return this.attachmentsService.upload(ticketId, file, request.user);
  }

  @Get('tickets/:ticketId/attachments')
  @ApiOperation({ summary: 'List metadata for attachments on a visible ticket' })
  list(
    @Param('ticketId', ParseMongoIdPipe) ticketId: string,
    @Query() query: ListAttachmentsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.attachmentsService.list(ticketId, request.user, query);
  }

  @Get('attachments/:id/content')
  @ApiOperation({ summary: 'Download an authorized attachment as an opaque file' })
  async download(
    @Param('id', ParseMongoIdPipe) id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const download = await this.attachmentsService.download(id, request.user);
    response.setHeader('Content-Type', download.metadata.mimeType);
    response.setHeader('Content-Length', download.metadata.size.toString());
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(download.metadata.originalName)}`,
    );
    return new StreamableFile(download.stream);
  }
}
