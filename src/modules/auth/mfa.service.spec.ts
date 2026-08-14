import { ConfigService } from '@nestjs/config';
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { AuditService } from '../audit/audit.service';
import type { UserDocument } from '../users/schemas/user.schema';
import { MfaService } from './mfa.service';
import type { MfaCryptoService } from './mfa-crypto.service';
import type { MfaChallengeDocument } from './schemas/mfa-challenge.schema';
import type { PasswordHasherService } from './password-hasher.service';

describe('MfaService', () => {
  it('atomically claims an attempt and consumes an exhausted challenge', async () => {
    const challengeId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const claimExec = jest.fn().mockResolvedValue({
      _id: challengeId,
      userId,
      attempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const findOneAndUpdate = jest.fn().mockReturnValueOnce({ exec: claimExec });
    const updateOneExec = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const challengeModel = {
      findOneAndUpdate,
      updateOne: jest.fn().mockReturnValue({ exec: updateOneExec }),
    } as unknown as Model<MfaChallengeDocument>;
    const userQuery = {
      select: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue({
        id: userId.toString(),
        mfaEnabled: true,
        mfaSecretEncrypted: 'encrypted-secret',
      }),
    };
    const userModel = {
      findById: jest.fn().mockReturnValue(userQuery),
    } as unknown as Model<UserDocument>;
    const crypto = {
      decrypt: jest.fn().mockReturnValue('totp-secret'),
      verifyCode: jest.fn().mockReturnValue(false),
    } as unknown as MfaCryptoService;
    const service = new MfaService(
      userModel,
      challengeModel,
      new ConfigService({ mfaEncryptionKeyBase64: Buffer.alloc(32).toString('base64') }),
      {} as AuditService,
      crypto,
      {} as PasswordHasherService,
    );

    await expect(service.completeChallenge('opaque-challenge', '000000')).rejects.toThrow(
      'Invalid MFA code.',
    );

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      {
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        usedAt: { $exists: false },
        expiresAt: { $gt: expect.any(Date) },
        attempts: { $lt: 5 },
      },
      { $inc: { attempts: 1 } },
      { new: true },
    );
    expect(challengeModel.updateOne).toHaveBeenCalledWith(
      {
        _id: challengeId,
        usedAt: { $exists: false },
        attempts: { $gte: 5 },
      },
      { $set: { usedAt: expect.any(Date) } },
    );
    expect(updateOneExec).toHaveBeenCalledTimes(1);
  });

  it('consumes a valid challenge with an atomic unused and unexpired condition', async () => {
    const challengeId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const claimedChallenge = {
      _id: challengeId,
      userId,
      attempts: 1,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const consumedChallenge = { ...claimedChallenge, usedAt: new Date() };
    const findOneAndUpdate = jest
      .fn()
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(claimedChallenge) })
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(consumedChallenge) });
    const challengeModel = { findOneAndUpdate } as unknown as Model<MfaChallengeDocument>;
    const user = {
      id: userId.toString(),
      mfaEnabled: true,
      mfaSecretEncrypted: 'encrypted-secret',
    } as unknown as UserDocument;
    const userModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(user),
      }),
    } as unknown as Model<UserDocument>;
    const crypto = {
      decrypt: jest.fn().mockReturnValue('totp-secret'),
      verifyCode: jest.fn().mockReturnValue(true),
    } as unknown as MfaCryptoService;
    const service = new MfaService(
      userModel,
      challengeModel,
      new ConfigService({ mfaEncryptionKeyBase64: Buffer.alloc(32).toString('base64') }),
      {} as AuditService,
      crypto,
      {} as PasswordHasherService,
    );

    await expect(service.completeChallenge('opaque-challenge', '123456')).resolves.toBe(user);

    expect(findOneAndUpdate).toHaveBeenLastCalledWith(
      {
        _id: challengeId,
        usedAt: { $exists: false },
        expiresAt: { $gt: expect.any(Date) },
      },
      { $set: { usedAt: expect.any(Date) } },
      { new: true },
    );
  });

  it('requires the current password before starting MFA setup', async () => {
    const user = {
      id: new Types.ObjectId().toString(),
      mfaEnabled: false,
      passwordHash: 'stored-password-hash',
      save: jest.fn(),
    } as unknown as UserDocument;
    const userModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(user),
      }),
    } as unknown as Model<UserDocument>;
    const crypto = {
      generateSecret: jest.fn(),
    } as unknown as MfaCryptoService;
    const passwordHasher = {
      verify: jest.fn().mockResolvedValue(false),
    } as unknown as PasswordHasherService;
    const service = new MfaService(
      userModel,
      {} as Model<MfaChallengeDocument>,
      new ConfigService(),
      {} as AuditService,
      crypto,
      passwordHasher,
    );

    await expect(service.setup(user.id, 'wrong-password')).rejects.toThrow('Invalid credentials.');

    expect(passwordHasher.verify).toHaveBeenCalledWith('wrong-password', 'stored-password-hash');
    expect(crypto.generateSecret).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });

  it('requires the current password before confirming MFA setup', async () => {
    const user = {
      id: new Types.ObjectId().toString(),
      mfaEnabled: false,
      passwordHash: 'stored-password-hash',
      mfaPendingSecretEncrypted: 'pending-secret',
      save: jest.fn(),
    } as unknown as UserDocument;
    const userModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(user),
      }),
    } as unknown as Model<UserDocument>;
    const crypto = {
      decrypt: jest.fn(),
      verifyCode: jest.fn(),
    } as unknown as MfaCryptoService;
    const passwordHasher = {
      verify: jest.fn().mockResolvedValue(false),
    } as unknown as PasswordHasherService;
    const service = new MfaService(
      userModel,
      {} as Model<MfaChallengeDocument>,
      new ConfigService(),
      {} as AuditService,
      crypto,
      passwordHasher,
    );

    await expect(service.verifySetup(user.id, 'wrong-password', '123456')).rejects.toThrow(
      'Invalid credentials.',
    );

    expect(crypto.decrypt).not.toHaveBeenCalled();
    expect(crypto.verifyCode).not.toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });
});
