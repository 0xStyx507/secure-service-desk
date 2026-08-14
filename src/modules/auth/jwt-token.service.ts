import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exportJWK, jwtVerify, SignJWT, type JWK, type KeyLike } from 'jose';
import { createPrivateKey, createPublicKey, randomUUID, type KeyObject } from 'node:crypto';
import type { UserDocument } from '../users/schemas/user.schema';
import { AuthenticatedUser } from './auth.types';
import { Role } from './roles.enum';
import type { JwtKeyRingEntry } from '../../config/environment.validation';

@Injectable()
export class JwtTokenService {
  private readonly privateKeys = new Map<string, Promise<KeyLike>>();
  private readonly publicKeys = new Map<string, Promise<KeyLike>>();

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
        kid: this.getActiveKey().kid,
      })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .sign(await this.getPrivateKey(this.getActiveKey()));
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const protectedHeader = this.readProtectedHeader(token);
      const key = this.getKeyRing().find((entry) => entry.kid === protectedHeader.kid);
      if (!key) throw new UnauthorizedException('Invalid access token.');
      const result = await jwtVerify(token, await this.getPublicKey(key), {
        issuer: this.getRequiredConfig('JWT_ISSUER'),
        audience: this.getRequiredConfig('JWT_AUDIENCE'),
        algorithms: ['RS256'],
      });
      if (result.protectedHeader.kid !== key.kid) {
        throw new UnauthorizedException('Invalid access token.');
      }
      const roles = Array.isArray(result.payload.roles)
        ? result.payload.roles.filter((role): role is Role =>
            Object.values(Role).includes(role as Role),
          )
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

  async getPublicJwks(): Promise<{ keys: JWK[] }> {
    const keys = await Promise.all(
      this.getKeyRing().map(async (entry) => {
        const jwk = await exportJWK(await this.getPublicKey(entry));
        return { ...jwk, kid: entry.kid, alg: 'RS256', use: 'sig' };
      }),
    );
    return { keys };
  }

  private getPrivateKey(entry: JwtKeyRingEntry): Promise<KeyLike> {
    let key = this.privateKeys.get(entry.kid);
    key ??= this.importPrivateKey(entry);
    this.privateKeys.set(entry.kid, key);
    return key;
  }

  private getPublicKey(entry: JwtKeyRingEntry): Promise<KeyLike> {
    let key = this.publicKeys.get(entry.kid);
    key ??= this.importPublicKey(entry);
    this.publicKeys.set(entry.kid, key);
    return key;
  }

  private async importPrivateKey(entry: JwtKeyRingEntry): Promise<KeyLike> {
    try {
      if (!entry.privateKeyBase64)
        throw new ServiceUnavailableException('JWT signing keys are not configured.');
      const key = createPrivateKey(this.decodeKey(entry.privateKeyBase64));
      this.assertStrongRsaKey(key);
      return key;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('JWT signing keys are not configured.');
    }
  }

  private async importPublicKey(entry: JwtKeyRingEntry): Promise<KeyLike> {
    try {
      const key = createPublicKey(this.decodeKey(entry.publicKeyBase64));
      this.assertStrongRsaKey(key);
      return key;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException('JWT signing keys are not configured.');
    }
  }

  private decodeKey(encoded: string): string {
    try {
      return Buffer.from(encoded, 'base64').toString('utf8');
    } catch {
      throw new ServiceUnavailableException('JWT signing keys are not configured.');
    }
  }

  private getKeyRing(): JwtKeyRingEntry[] {
    const ring = this.configService.get<JwtKeyRingEntry[]>('jwtKeyRing');
    if (ring && ring.length > 0) return ring;
    return [
      {
        kid: this.getRequiredConfig('JWT_KEY_ID'),
        privateKeyBase64: this.getRequiredConfig('JWT_PRIVATE_KEY_BASE64'),
        publicKeyBase64: this.getRequiredConfig('JWT_PUBLIC_KEY_BASE64'),
      },
    ];
  }

  private getActiveKey(): JwtKeyRingEntry {
    const active = this.getRequiredConfig('JWT_KEY_ID');
    const key = this.getKeyRing().find((entry) => entry.kid === active);
    if (!key || !key.privateKeyBase64)
      throw new ServiceUnavailableException('Active JWT signing key is not configured.');
    return key;
  }

  private readProtectedHeader(token: string): { kid?: string } {
    try {
      const encoded = token.split('.')[0];
      if (!encoded) throw new Error('Missing header');
      const header = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
      return typeof header === 'object' && header !== null ? (header as { kid?: string }) : {};
    } catch {
      throw new UnauthorizedException('Invalid access token.');
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
