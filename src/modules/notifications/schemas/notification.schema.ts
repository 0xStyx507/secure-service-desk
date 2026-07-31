import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { NotificationDeliveryStatus } from '../notification-delivery-status.enum';

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ timestamps: true, versionKey: false, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, required: true, index: true, ref: 'User' })
  userId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 80, index: true })
  type!: string;

  @Prop({ required: true, trim: true, maxlength: 160 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 1_000 })
  message!: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  resourceType!: string;

  @Prop({ required: true, trim: true, maxlength: 200, index: true })
  resourceId!: string;

  @Prop({ type: Date, index: true })
  readAt?: Date;

  @Prop({
    enum: Object.values(NotificationDeliveryStatus),
    default: NotificationDeliveryStatus.PENDING,
    index: true,
  })
  deliveryStatus!: NotificationDeliveryStatus;

  @Prop({ type: Date })
  deliveredAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
