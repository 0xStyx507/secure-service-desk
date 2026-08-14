import type { Model } from 'mongoose';
import type { RequestContextService } from '../../infrastructure/context/request-context.service';
import { AuditService } from './audit.service';
import type { AuditEventDocument } from './schemas/audit-event.schema';

describe('AuditService', () => {
  it('persists classified critical events without swallowing storage errors', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const service = new AuditService(
      { create } as unknown as Model<AuditEventDocument>,
      { requestId: 'request-1' } as RequestContextService,
    );

    await service.recordCritical({
      actorId: '507f1f77bcf86cd799439011',
      action: 'MFA_ENABLED',
      resourceType: 'user',
      resourceId: '507f1f77bcf86cd799439011',
      metadata: { method: 'TOTP' },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MFA_ENABLED',
        requestId: 'request-1',
      }),
    );
  });

  it('rejects an event that is not classified as critical', async () => {
    const create = jest.fn();
    const service = new AuditService(
      { create } as unknown as Model<AuditEventDocument>,
      {} as RequestContextService,
    );

    await expect(
      service.recordCritical({
        action: 'USER_LOGIN_SUCCEEDED',
        resourceType: 'session',
        resourceId: 'session-1',
      }),
    ).rejects.toThrow('not classified as critical');
    expect(create).not.toHaveBeenCalled();
  });

  it('propagates a critical audit persistence failure', async () => {
    const create = jest.fn().mockRejectedValue(new Error('Mongo unavailable'));
    const service = new AuditService(
      { create } as unknown as Model<AuditEventDocument>,
      {} as RequestContextService,
    );

    await expect(
      service.recordCritical({
        action: 'REFRESH_TOKEN_REUSE_DETECTED',
        resourceType: 'session',
        resourceId: 'family-1',
      }),
    ).rejects.toThrow('Mongo unavailable');
  });
});
