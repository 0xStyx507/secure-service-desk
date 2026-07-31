import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoleMutationLockDocument = HydratedDocument<RoleMutationLock>;

@Schema({ versionKey: false, collection: 'role_mutation_locks' })
export class RoleMutationLock {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop()
  owner?: string;

  @Prop({ type: Date })
  lockedUntil?: Date;
}

export const RoleMutationLockSchema = SchemaFactory.createForClass(RoleMutationLock);
