import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AttachmentStoragePort } from './cloud.ports';

const MAX_OBJECT_KEY_LENGTH = 512;

export class S3AttachmentStorage implements AttachmentStoragePort {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async putObject(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.getBucket(),
        Key: this.validateObjectKey(input.key),
        Body: input.body,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.getBucket(),
        Key: this.validateObjectKey(key),
      }),
    );
  }

  private getBucket(): string {
    const bucket = this.bucket.trim();
    if (!bucket || bucket.length > 63) {
      throw new Error('Cloud attachment bucket is not configured');
    }
    return bucket;
  }

  private validateObjectKey(key: string): string {
    if (
      !key ||
      key.length > MAX_OBJECT_KEY_LENGTH ||
      key.startsWith('/') ||
      key.includes('..') ||
      key.includes('\0')
    ) {
      throw new Error('Invalid cloud object key');
    }
    return key;
  }
}
