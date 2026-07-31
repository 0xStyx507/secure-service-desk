import { UnauthorizedException } from '@nestjs/common';
import { CsrfService } from './csrf.service';

describe('CsrfService', () => {
  const service = new CsrfService();

  it('accepts matching double-submit tokens', () => {
    const token = service.issue();
    expect(() => service.assertValid(token, token)).not.toThrow();
  });

  it('rejects missing or mismatched tokens', () => {
    expect(() => service.assertValid(undefined, undefined)).toThrow(UnauthorizedException);
    expect(() => service.assertValid('cookie-token', 'header-token')).toThrow(
      UnauthorizedException,
    );
  });
});
