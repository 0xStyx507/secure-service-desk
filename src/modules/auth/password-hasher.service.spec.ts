import { PasswordHasherService } from './password-hasher.service';

describe('PasswordHasherService', () => {
  const service = new PasswordHasherService();

  it('hashes and verifies a password without storing plaintext', async () => {
    const password = 'Portfolio-password-123!';
    const hash = await service.hash(password);

    expect(hash).not.toContain(password);
    await expect(service.verify(password, hash)).resolves.toBe(true);
    await expect(service.verify('wrong-password', hash)).resolves.toBe(false);
  });
});
