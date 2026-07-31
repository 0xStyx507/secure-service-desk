import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT, type KeyLike } from 'jose';
import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  type KeyObject,
} from 'node:crypto';
import type { UserDocument } from '../users/schemas/user.schema';
import { AuthenticatedUser } from './auth.types';
import { Role } from './roles.enum';

@Injectable()
export class JwtTokenService {
  private privateKey?: Promise<KeyLike>;
  private publicKey?: Promise<KeyLike>;

  constructor(private readonly configService: ConfigService) {}

  async signAccessToken(user: UserDocument): Promise<string> {
    const issuer = this.getRequiredConfig('JWT_ISSUER');
    const audience = this.getRequiredConfig('JWT_AUDIENCE');
    const ttl = this.configService.get<number>('jwtAccessTtlSeconds') ?? 900;
    const now = Math.floor(Date.now() / 1_000);

    return new SignJWT({
      email: user.email,
      roles: user.roles,
      authzVersion: user.authzVersion,
    })
      .setProtectedHeader({
        alg: 'RS256',
        typ: 'JWT',
        kid: this.getRequiredConfig('JWT_KEY_ID'),
      })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .sign(await this.getPrivateKey());
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const result = await jwtVerify(token, await this.getPublicKey(), {
        issuer: this.getRequiredConfig('JWT_ISSUER'),
        audience: this.getRequiredConfig('JWT_AUDIENCE'),
        algorithms: ['RS256'],
      });
      if (result.protectedHeader.kid !== this.getRequiredConfig('JWT_KEY_ID')) {
        throw new UnauthorizedException('Invalid access token.');
      }
      const roles = Array.isArray(result.payload.roles)
        ? result.payload.roles.filter((role): role is Role => Object.values(Role).includes(role as Role))
        : [];

      if (
        !result.payload.sub ||
        typeof result.payload.email !== 'string' ||
        typeof result.payload.authzVersion !== 'number'
      ) {
        throw new UnauthorizedException('Invalid access token.');
      }

      return {
        ...result.payload,
        sub: result.payload.sub,
        email: result.payload.email,
        roles,
        authzVersion: result.payload.authzVersion,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException || error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid access token.');
    }
  }

  private getPrivateKey(): Promise<KeyLike> {
    this.privateKey ??= this.importPrivateKey();
    return this.privateKey;
  }

  private getPublicKey(): Promise<KeyLike> {
    this.publicKey ??= this.importPublicKey();
    return this.publicKey;
  }

  private async importPrivateKey(): Promise<KeyLike> {
    try {
      const key = createPrivateKey(this.decodeKey('JWT_PRIVATE_KEY_BASE64'));
      this.assertStrongRsaKey(key);
      return key;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('JWT signing keys are not configured.');
    }
  }

  private async importPublicKey(): Promise<KeyLike> {
    try {
      const key = createPublicKey(this.decodeKey('JWT_PUBLIC_KEY_BASE64'));
      this.assertStrongRsaKey(key);
      return key;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('JWT signing keys are not configured.');
    }
  }

  private decodeKey(name: string): string {
    const encoded = this.getRequiredConfig(name);
    try {
      return Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      throw new ServiceUnavailableException('JWT signing keys are not configured.');
    }
  }

  private getRequiredConfig(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      throw new ServiceUnavailableException('JWT signing keys are not configured.');
    }

    return value;
  }

  private assertStrongRsaKey(key: KeyObject): void {
    const modulusLength = key.asymmetricKeyDetails?.modulusLength;
    if (key.asymmetricKeyType !== 'rsa' || !modulusLength || modulusLength < 3_072) {
      throw new ServiceUnavailableException('JWT signing keys must be RSA 3072 bits or stronger.');
    }
  }
}
