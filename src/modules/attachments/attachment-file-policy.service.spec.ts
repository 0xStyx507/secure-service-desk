import { BadRequestException } from '@nestjs/common';
import { AttachmentFilePolicyService } from './attachment-file-policy.service';

describe('AttachmentFilePolicyService', () => {
  const service = new AttachmentFilePolicyService();

  it('accepts a PNG whose signature matches its declared MIME type', () => {
    const dimensions = Buffer.alloc(8);
    dimensions.writeUInt32BE(800, 0);
    dimensions.writeUInt32BE(600, 4);
    const buffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([0, 0, 0, 13]),
      Buffer.from('IHDR'),
      dimensions,
      Buffer.from([8, 2, 0, 0, 0]),
      Buffer.alloc(4),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('IEND'),
      Buffer.alloc(4),
    ]);

    expect(
      service.validate({
        originalname: '../screenshot.png',
        mimetype: 'image/png',
        size: buffer.length,
        buffer,
      }),
    ).toEqual({ originalName: 'screenshot.png', mimeType: 'image/png' });
  });

  it('rejects a file that only claims to be an image', () => {
    const buffer = Buffer.from('not-an-image');

    expect(() =>
      service.validate({
        originalname: 'fake.png',
        mimetype: 'image/png',
        size: buffer.length,
        buffer,
      }),
    ).toThrow(BadRequestException);
  });
});
