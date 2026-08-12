import { MfaCryptoService } from './mfa-crypto.service';

describe('MfaCryptoService', () => {
  const service = new MfaCryptoService();

  it('verifies the RFC 6238 reference vector with a clock window', () => {
    expect(
      service.verifyCode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59_000),
    ).toBe(true);
  });

  it('encrypts and decrypts a secret without returning plaintext ciphertext', () => {
    const key = Buffer.alloc(32, 7);
    const encrypted = service.encrypt('JBSWY3DPEHPK3PXP', key);
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(service.decrypt(encrypted, key)).toBe('JBSWY3DPEHPK3PXP');
  });
});
