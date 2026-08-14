import { ConfigService } from '@nestjs/config';

interface AwsCredentialIdentity {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface AwsClientOptions {
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?: AwsCredentialIdentity;
}

export function awsClientOptions(configService: ConfigService): AwsClientOptions {
  const endpoint = configService.get<string>('awsEndpointUrl')?.trim();
  const accessKeyId = configService.get<string>('awsAccessKeyId')?.trim();
  const secretAccessKey = configService.get<string>('awsSecretAccessKey')?.trim();

  return {
    region: configService.get<string>('awsRegion') ?? 'us-east-1',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
  };
}
