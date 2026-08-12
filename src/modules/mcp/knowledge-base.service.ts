import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { KnowledgeArticle, KnowledgeArticleDocument } from './schemas/knowledge-article.schema';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @InjectModel(KnowledgeArticle.name)
    private readonly articleModel: Model<KnowledgeArticleDocument>,
  ) {}

  async search(query: string, limit = 10): Promise<Array<Record<string, unknown>>> {
    const normalized = query.trim();
    const filter: Record<string, unknown> = { status: 'PUBLISHED' };
    if (normalized) {
      const expression = new RegExp(this.escapeRegExp(normalized), 'i');
      filter.$or = [{ title: expression }, { content: expression }, { tags: expression }];
    }
    const items = await this.articleModel
      .find(filter)
      .select('slug title content tags updatedAt')
      .sort({ updatedAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 20))
      .lean()
      .exec();
    return items as unknown as Array<Record<string, unknown>>;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
