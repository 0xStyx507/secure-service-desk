import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MfaChallengeDocument = HydratedDocument<MfaChallenge>;

@Schema({ timestamps: true, versionKey: false, collection: 'mfa_challenges' })
export class MfaChallenge {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, select: false })
  tokenHash!: string;

  @Prop({ required: true, expires: 0 })
  expiresAt!: Date;

  @Prop({ default: 0, min: 0 })
  attempts!: number;

  @Prop({ type: Date })
  usedAt?: Date;
}

export const MfaChallengeSchema = SchemaFactory.createForClass(MfaChallenge);
MfaChallengeSchema.index({ userId: 1, expiresAt: 1 });
