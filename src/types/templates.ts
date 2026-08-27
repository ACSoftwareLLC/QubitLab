import type { Circuit } from '../api/types';

export type TemplateCategory =
  | 'foundations'
  | 'algorithm'
  | 'entanglement'
  | 'games';

export interface TemplateSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: TemplateCategory;
  difficulty: number;
  published: boolean;
}

export interface TemplateDetail extends TemplateSummary {
  circuit: Circuit;
  articleHtml: string;
  createdAt: string;
  updatedAt: string;
}

// Type alias (not interface): apiFetch bodies must satisfy Record<string, unknown>,
// which TS only allows for object literal types with implicit index signatures.
export type TemplateInput = {
  slug?: string;
  title?: string;
  description?: string;
  category?: TemplateCategory;
  difficulty?: number;
  circuit?: Circuit;
  articleHtml?: string;
  published?: boolean;
  sortOrder?: number;
};
