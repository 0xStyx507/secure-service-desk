import { ConfigService } from '@nestjs/config';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import type { UserDocument } from '../users/schemas/user.schema';
import { JwtTokenService } from './jwt-token.service';
import { Role } from './roles.enum';

describe('JwtTokenService', () => {
  it('signs and verifies an RS256 access token with required claims', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', {
      extractable: true,
      modulusLength: 3_072,
    });
    const privatePem = await exportPKCS8(privateKey);
    const publicPem = await exportSPKI(publicKey);
    const config = new ConfigService({
      JWT_ISSUER: 'test-issuer',
      JWT_AUDIENCE: 'test-audience',
      JWT_KEY_ID: 'test-key-1',
      JWT_PRIVATE_KEY_BASE64: Buffer.from(privatePem).toString('base64'),
      JWT_PUBLIC_KEY_BASE64: Buffer.from(publicPem).toString('base64'),
      jwtAccessTtlSeconds: 900,
    });
    const service = new JwtTokenService(config);
    const user = {
      id: '507f1f77bcf86cd799439011',
      email: 'user@example.com',
      roles: [Role.USER],
      authzVersion: 0,
    } as UserDocument;

    const token = await service.signAccessToken(user);
    const payload = await service.verifyAccessToken(token);

    expect(payload).toMatchObject({
      sub: user.id,
      email: user.email,
      roles: [Role.USER],
      authzVersion: 0,
      iss: 'test-issuer',
      aud: 'test-audience',
    });
    expect(payload.jti).toEqual(expect.any(String));
    expect(payload.exp).toEqual(expect.any(Number));
  });
});
