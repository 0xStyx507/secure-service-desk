import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { SecretsProviderPort } from './cloud.ports';

export class AwsSecretsProvider implements SecretsProviderPort {
  constructor(private readonly client: SecretsManagerClient) {}

  async getSecret(secretId: string): Promise<string> {
    if (!secretId || secretId.length > 512) {
      throw new Error('Invalid cloud secret identifier');
    }
    const response = await this.client.send(new GetSecretValueCommand({ SecretId: secretId }));
    if (response.SecretString !== undefined) {
      return response.SecretString;
    }
    if (response.SecretBinary !== undefined) {
      return Buffer.from(response.SecretBinary as Uint8Array).toString('utf8');
    }
    throw new Error('Cloud secret has no value');
  }
}
