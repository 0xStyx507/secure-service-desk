import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types, type HydratedDocument } from 'mongoose';

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

@Schema({ timestamps: true, versionKey: false })
export class RefreshSession {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ required: true, index: true })
  familyId!: string;

  @Prop({ required: true, type: Date, index: { expireAfterSeconds: 0 } })
  expiresAt!: Date;

  @Prop({ type: Date })
  revokedAt?: Date;

  @Prop()
  revokeReason?: string;

  @Prop()
  replacedByTokenHash?: string;
}

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession);
