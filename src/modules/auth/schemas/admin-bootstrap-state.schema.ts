import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminBootstrapStateDocument = HydratedDocument<AdminBootstrapState>;

@Schema({ versionKey: false, collection: 'system_bootstrap_state' })
export class AdminBootstrapState {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ type: Date, required: true })
  completedAt!: Date;
}

export const AdminBootstrapStateSchema = SchemaFactory.createForClass(AdminBootstrapState);
