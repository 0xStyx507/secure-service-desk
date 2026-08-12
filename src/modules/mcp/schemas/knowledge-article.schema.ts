import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type KnowledgeArticleDocument = HydratedDocument<KnowledgeArticle>;

@Schema({ timestamps: true, versionKey: false, collection: 'knowledge_articles' })
export class KnowledgeArticle {
  @Prop({ required: true, unique: true, trim: true, maxlength: 120 })
  slug!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  title!: string;

  @Prop({ required: true, trim: true, maxlength: 20_000 })
  content!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ enum: ['DRAFT', 'PUBLISHED'], default: 'DRAFT', index: true })
  status!: 'DRAFT' | 'PUBLISHED';

  updatedAt!: Date;
}

export const KnowledgeArticleSchema = SchemaFactory.createForClass(KnowledgeArticle);
KnowledgeArticleSchema.index({ title: 'text', content: 'text', tags: 'text' });
