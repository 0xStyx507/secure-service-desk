import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { basename } from 'node:path';
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES } from './attachments.constants';

export interface UploadedAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ValidatedAttachment {
  originalName: string;
  mimeType: (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];
}

@Injectable()
export class AttachmentFilePolicyService {
  validate(file: UploadedAttachment): ValidatedAttachment {
    if (file.size < 1 || file.buffer.length < 1) {
      throw new BadRequestException('Attachment is empty.');
    }
    if (file.size > MAX_ATTACHMENT_BYTES || file.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new PayloadTooLargeException('Attachment exceeds the 5 MB limit.');
    }

    const detectedMime = this.detectMime(file.buffer);
    if (!detectedMime || !ALLOWED_ATTACHMENT_MIME_TYPES.includes(detectedMime)) {
      throw new BadRequestException('Only validated JPEG and PNG images are accepted.');
    }
    if (file.mimetype !== detectedMime) {
      throw new BadRequestException('Attachment content does not match its declared MIME type.');
    }
    this.assertSafeDimensions(file.buffer, detectedMime);

    const normalizedPath = file.originalname.replaceAll('\\', '/');
    const originalName = basename(normalizedPath)
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 180);
    if (!originalName) {
      throw new BadRequestException('Attachment filename is invalid.');
    }
    return { originalName, mimeType: detectedMime };
  }

  private detectMime(buffer: Buffer): ValidatedAttachment['mimeType'] | undefined {
    if (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    return undefined;
  }

  private assertSafeDimensions(buffer: Buffer, mimeType: ValidatedAttachment['mimeType']): void {
    const dimensions =
      mimeType === 'image/png' ? this.readPngDimensions(buffer) : this.readJpegDimensions(buffer);
    if (
      !dimensions ||
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > 10_000 ||
      dimensions.height > 10_000 ||
      dimensions.width * dimensions.height > 25_000_000
    ) {
      throw new BadRequestException('Attachment image dimensions are invalid or unsafe.');
    }
  }

  private readPngDimensions(buffer: Buffer): { width: number; height: number } | undefined {
    if (buffer.length < 45) {
      return undefined;
    }
    const hasHeader = buffer.readUInt32BE(8) === 13 && buffer.toString('ascii', 12, 16) === 'IHDR';
    const hasEnd =
      buffer.readUInt32BE(buffer.length - 12) === 0 &&
      buffer.toString('ascii', buffer.length - 8, buffer.length - 4) === 'IEND';
    if (!hasHeader || !hasEnd) {
      return undefined;
    }
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  private readJpegDimensions(buffer: Buffer): { width: number; height: number } | undefined {
    if (!this.hasJpegEndMarker(buffer)) return undefined;
    const startOfFrameMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ]);
    let offset = 2;
    while (offset + 8 < buffer.length) {
      const segment = this.readJpegSegment(buffer, offset, startOfFrameMarkers);
      if (segment?.dimensions) return segment.dimensions;
      if (!segment || segment.stop) return undefined;
      offset = segment.nextOffset;
    }
    return undefined;
  }

  private hasJpegEndMarker(buffer: Buffer): boolean {
    return (
      buffer.length >= 12 &&
      buffer[buffer.length - 2] === 0xff &&
      buffer[buffer.length - 1] === 0xd9
    );
  }

  private readJpegSegment(
    buffer: Buffer,
    offset: number,
    startOfFrameMarkers: Set<number>,
  ):
    | { nextOffset: number; stop?: boolean; dimensions?: { width: number; height: number } }
    | undefined {
    if (buffer[offset] !== 0xff) return { nextOffset: offset + 1 };
    const marker = buffer[offset + 1];
    if (marker === undefined || marker === 0xd9 || marker === 0xda)
      return { nextOffset: offset, stop: true };
    const segmentLength = buffer.readUInt16BE(offset + 2);
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) return undefined;
    if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
      return {
        nextOffset: offset,
        dimensions: {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        },
      };
    }
    return { nextOffset: offset + 2 + segmentLength };
  }
}
