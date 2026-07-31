import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { Role } from '../../auth/roles.enum';
import { UserStatus } from '../user-status.enum';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, maxlength: 254 })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ type: [String], enum: Object.values(Role), default: [Role.USER] })
  roles!: Role[];

  @Prop({ enum: Object.values(UserStatus), default: UserStatus.ACTIVE, index: true })
  status!: UserStatus;

  @Prop({ default: 0, min: 0 })
  failedLoginAttempts!: number;

  @Prop({ default: 0, min: 0 })
  authzVersion!: number;

  @Prop({ type: Date })
  lockedUntil?: Date;

  @Prop({ type: Date })
  lastLoginAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
