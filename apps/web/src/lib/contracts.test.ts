import { describe, expect, it } from 'vitest';
import { decodeCurrentUser, decodePage, decodeTicket } from './contracts';

describe('API runtime contracts', () => {
  it('rejects an identity containing an unknown role', () => {
    expect(() =>
      decodeCurrentUser({
        sub: '507f1f77bcf86cd799439011',
        email: 'user@example.com',
        roles: ['SUPER_ADMIN'],
        authzVersion: 1,
      }),
    ).toThrow(/identidad inválido/i);
  });

  it('rejects malformed ticket pages before rendering them', () => {
    expect(() =>
      decodePage(
        {
          items: [{ _id: '507f1f77bcf86cd799439011', subject: 'Incomplete ticket' }],
          pagination: { page: 1, limit: 10, total: 1, pages: 1 },
        },
        decodeTicket,
      ),
    ).toThrow(/ticket inválido/i);
  });
});
