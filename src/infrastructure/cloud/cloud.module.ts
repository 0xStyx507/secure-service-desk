import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SQSClient } from '@aws-sdk/client-sqs';
import { awsClientOptions } from './aws-client-options';
import { AwsSecretsProvider } from './aws-secrets-provider';
import { CloudWatchObservability } from './cloudwatch-observability';
import {
  ATTACHMENT_STORAGE_PORT,
  EVENT_PUBLISHER_PORT,
  OBSERVABILITY_PORT,
  SECRETS_PROVIDER_PORT,
} from './cloud.ports';
import { S3AttachmentStorage } from './s3-attachment-storage';
import { SqsEventPublisher } from './sqs-event-publisher';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: S3Client,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => new S3Client(awsClientOptions(configService)),
    },
    {
      provide: SQSClient,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => new SQSClient(awsClientOptions(configService)),
    },
    {
      provide: SecretsManagerClient,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new SecretsManagerClient(awsClientOptions(configService)),
    },
    {
      provide: CloudWatchClient,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new CloudWatchClient(awsClientOptions(configService)),
    },
    {
      provide: ATTACHMENT_STORAGE_PORT,
      inject: [S3Client, ConfigService],
      useFactory: (client: S3Client, configService: ConfigService) =>
        new S3AttachmentStorage(client, configService.get<string>('awsS3Bucket') ?? ''),
    },
    {
      provide: EVENT_PUBLISHER_PORT,
      inject: [SQSClient],
      useFactory: (client: SQSClient) => new SqsEventPublisher(client),
    },
    {
      provide: SECRETS_PROVIDER_PORT,
      inject: [SecretsManagerClient],
      useFactory: (client: SecretsManagerClient) => new AwsSecretsProvider(client),
    },
    {
      provide: OBSERVABILITY_PORT,
      inject: [CloudWatchClient, ConfigService],
      useFactory: (client: CloudWatchClient, configService: ConfigService) =>
        new CloudWatchObservability(
          client,
          configService.get<string>('awsCloudWatchNamespace') ?? 'SecureServiceDesk',
        ),
    },
  ],
  exports: [
    ATTACHMENT_STORAGE_PORT,
    EVENT_PUBLISHER_PORT,
    SECRETS_PROVIDER_PORT,
    OBSERVABILITY_PORT,
  ],
})
export class CloudModule {}
