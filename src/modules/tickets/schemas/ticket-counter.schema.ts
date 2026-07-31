import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TicketCounterDocument = HydratedDocument<TicketCounter>;

@Schema({ versionKey: false, collection: 'counters' })
export class TicketCounter {
  @Prop({ required: true, unique: true })
  key!: string;

  @Prop({ required: true, min: 0, default: 0 })
  sequence!: number;
}

export const TicketCounterSchema = SchemaFactory.createForClass(TicketCounter);
