import { Injectable } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

@Injectable()
export class MfaCryptoService {
  generateSecret(): string {
    const bytes = randomBytes(20);
    let bits = '';
    for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
    let secret = '';
    for (let index = 0; index < bits.length; index += 5) {
      const value = Number.parseInt(bits.slice(index, index + 5).padEnd(5, '0'), 2);
      secret += BASE32_ALPHABET[value];
    }
    return secret;
  }

  verifyCode(secret: string, code: string, now = Date.now()): boolean {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) return false;
    const counter = Math.floor(now / 1_000 / TOTP_PERIOD_SECONDS);
    return [-1, 0, 1].some((offset) => {
      const expected = this.generateCode(secret, Math.max(0, counter + offset));
      return timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
    });
  }

  buildOtpAuthUri(secret: string, email: string): string {
    const issuer = 'Secure Service Desk';
    return `otpauth://totp/${encodeURIComponent(`${issuer}:${email}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;
  }

  encrypt(secret: string, key: Buffer): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string, key: Buffer): string {
    const [version, encodedIv, encodedTag, encodedCiphertext] = payload.split('.');
    if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext) {
      throw new Error('Invalid MFA secret payload.');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encodedIv, 'base64url'));
    decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private generateCode(secret: string, counter: number): string {
    const key = this.decodeBase32(secret);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', key).update(counterBuffer).digest();
    const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
    const binary = (((digest[offset] ?? 0) & 0x7f) << 24) |
      (((digest[offset + 1] ?? 0) & 0xff) << 16) |
      (((digest[offset + 2] ?? 0) & 0xff) << 8) |
      ((digest[offset + 3] ?? 0) & 0xff);
    return String(binary % 1_000_000).padStart(6, '0');
  }

  private decodeBase32(value: string): Buffer {
    const normalized = value.replace(/=+$/, '').toUpperCase();
    let bits = '';
    for (const character of normalized) {
      const index = BASE32_ALPHABET.indexOf(character);
      if (index < 0) throw new Error('Invalid MFA secret.');
      bits += index.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
      bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
  }
}
