import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';

@Injectable()
export class CsrfService {
  issue(): string {
    return randomBytes(32).toString('base64url');
  }

  assertValid(cookieToken: string | undefined, headerToken: string | undefined): void {
    if (!cookieToken || !headerToken) {
      throw new UnauthorizedException('CSRF token is required.');
    }

    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);
    if (
      cookieBuffer.length !== headerBuffer.length ||
      !timingSafeEqual(cookieBuffer, headerBuffer)
    ) {
      throw new UnauthorizedException('Invalid CSRF token.');
    }
  }
}
