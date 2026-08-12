import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { AuditService } from '../audit/audit.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { MfaCryptoService } from './mfa-crypto.service';
import { MfaChallenge, MfaChallengeDocument } from './schemas/mfa-challenge.schema';
import { PasswordHasherService } from './password-hasher.service';

export type MfaChallengeResult = {
  mfaRequired: true;
  challengeToken: string;
  expiresIn: number;
};

@Injectable()
export class MfaService {
  private readonly challengeTtlSeconds = 300;
  private readonly maxAttempts = 5;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(MfaChallenge.name)
    private readonly challengeModel: Model<MfaChallengeDocument>,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly crypto: MfaCryptoService,
    private readonly passwordHasher: PasswordHasherService,
  ) {}

  async setup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.findUserWithMfa(userId);
    if (user.mfaEnabled) throw new ConflictException('MFA is already enabled.');
    const secret = this.crypto.generateSecret();
    user.mfaPendingSecretEncrypted = this.crypto.encrypt(secret, this.encryptionKey());
    await user.save();
    return { secret, otpauthUri: this.crypto.buildOtpAuthUri(secret, user.email) };
  }

  async verifySetup(userId: string, code: string): Promise<void> {
    const user = await this.findUserWithMfa(userId);
    if (!user.mfaPendingSecretEncrypted) {
      throw new ConflictException('MFA setup has not started.');
    }
    const secret = this.crypto.decrypt(user.mfaPendingSecretEncrypted, this.encryptionKey());
    if (!this.crypto.verifyCode(secret, code)) throw new UnauthorizedException('Invalid MFA code.');
    user.mfaSecretEncrypted = user.mfaPendingSecretEncrypted;
    user.mfaPendingSecretEncrypted = undefined;
    user.mfaEnabled = true;
    user.authzVersion += 1;
    await user.save();
    await this.auditService.record({
      actorId: user.id,
      action: 'MFA_ENABLED',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { method: 'TOTP' },
    }).catch(() => undefined);
  }

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.userModel
      .findById(userId)
      .select('+passwordHash +mfaSecretEncrypted +mfaPendingSecretEncrypted')
      .exec();
    if (!user || !(await this.passwordHasher.verify(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
      throw new ConflictException('MFA is not enabled.');
    }
    const secret = this.crypto.decrypt(user.mfaSecretEncrypted, this.encryptionKey());
    if (!this.crypto.verifyCode(secret, code)) throw new UnauthorizedException('Invalid MFA code.');
    user.mfaEnabled = false;
    user.mfaSecretEncrypted = undefined;
    user.mfaPendingSecretEncrypted = undefined;
    user.authzVersion += 1;
    await user.save();
    await this.auditService.record({
      actorId: user.id,
      action: 'MFA_DISABLED',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { method: 'TOTP' },
    }).catch(() => undefined);
  }

  async status(userId: string): Promise<{ enabled: boolean }> {
    const user = await this.userModel.findById(userId).select('+mfaSecretEncrypted').exec();
    return { enabled: Boolean(user?.mfaEnabled && user.mfaSecretEncrypted) };
  }

  async createChallenge(user: UserDocument): Promise<MfaChallengeResult> {
    const challengeToken = randomBytes(32).toString('base64url');
    await this.challengeModel.create({
      userId: new Types.ObjectId(user.id),
      tokenHash: this.hash(challengeToken),
      expiresAt: new Date(Date.now() + this.challengeTtlSeconds * 1_000),
    });
    return { mfaRequired: true, challengeToken, expiresIn: this.challengeTtlSeconds };
  }

  async completeChallenge(challengeToken: string, code: string): Promise<UserDocument> {
    const challenge = await this.challengeModel
      .findOne({ tokenHash: this.hash(challengeToken), usedAt: { $exists: false } })
      .select('+tokenHash')
      .exec();
    if (!challenge || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= this.maxAttempts) {
      throw new UnauthorizedException('Invalid or expired MFA challenge.');
    }
    const user = await this.findUserWithMfa(challenge.userId.toString());
    const secret = user.mfaSecretEncrypted
      ? this.crypto.decrypt(user.mfaSecretEncrypted, this.encryptionKey())
      : undefined;
    if (!user.mfaEnabled || !secret || !this.crypto.verifyCode(secret, code)) {
      challenge.attempts += 1;
      if (challenge.attempts >= this.maxAttempts) challenge.usedAt = new Date();
      await challenge.save();
      throw new UnauthorizedException('Invalid MFA code.');
    }
    const consumed = await this.challengeModel.findOneAndUpdate(
      { _id: challenge._id, usedAt: { $exists: false } },
      { $set: { usedAt: new Date() } },
      { new: true },
    ).exec();
    if (!consumed) throw new UnauthorizedException('MFA challenge already used.');
    return user;
  }

  private async findUserWithMfa(userId: string): Promise<UserDocument> {
    const user = await this.userModel
      .findById(userId)
      .select('+mfaSecretEncrypted +mfaPendingSecretEncrypted')
      .exec();
    if (!user) throw new UnauthorizedException('User is not available.');
    return user;
  }

  private encryptionKey(): Buffer {
    const encoded = this.configService.get<string>('mfaEncryptionKeyBase64') ??
      this.configService.get<string>('MFA_ENCRYPTION_KEY_BASE64');
    if (!encoded) throw new ServiceUnavailableException('MFA encryption key is not configured.');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) throw new ServiceUnavailableException('MFA encryption key must be 32 bytes.');
    return key;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
