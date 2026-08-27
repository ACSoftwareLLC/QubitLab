import { describe, it, expect } from 'vitest';
import {
  createTemplateSchema,
  updateTemplateSchema,
  circuitSchema,
} from './schemas.js';

const validCircuit = circuitSchema.parse({
  numBits: 2,
  ops: [
    { id: 1, type: 'H', segment: 0, targets: [0], controls: [], angle: null },
    { id: 2, type: 'CX', segment: 1, targets: [1], controls: [0], angle: null },
  ],
});

const validTemplate = {
  slug: 'bell-state',
  title: 'Bell State',
  description: 'Create and verify maximal entanglement.',
  category: 'entanglement',
  difficulty: 1,
  circuit: validCircuit,
  articleHtml: '<p>How the Bell state works.</p>',
};

describe('createTemplateSchema', () => {
  it('accepts a fully valid template body', () => {
    expect(createTemplateSchema.safeParse(validTemplate).success).toBe(true);
  });

  it('defaults published to false and sortOrder to 0', () => {
    const result = createTemplateSchema.parse(validTemplate);
    expect(result.published).toBe(false);
    expect(result.sortOrder).toBe(0);
  });

  it('rejects slugs outside kebab-case 3-80', () => {
    for (const bad of ['ab', 'UPPER-CASE', 'has_underscore', '-'.repeat(81)]) {
      expect(
        createTemplateSchema.safeParse({ ...validTemplate, slug: bad }).success
      ).toBe(false);
    }
  });

  it('rejects category values outside the enum', () => {
    expect(
      createTemplateSchema.safeParse({ ...validTemplate, category: 'misc' })
        .success
    ).toBe(false);
  });

  it('rejects difficulty outside 1-3', () => {
    expect(
      createTemplateSchema.safeParse({ ...validTemplate, difficulty: 4 })
        .success
    ).toBe(false);
  });

  it('rejects empty articleHtml and oversized description', () => {
    expect(
      createTemplateSchema.safeParse({ ...validTemplate, articleHtml: '' })
        .success
    ).toBe(false);
    expect(
      createTemplateSchema.safeParse({
        ...validTemplate,
        description: 'x'.repeat(201),
      }).success
    ).toBe(false);
  });
});

describe('updateTemplateSchema', () => {
  it('accepts partial updates', () => {
    expect(
      updateTemplateSchema.safeParse({ title: 'New title' }).success
    ).toBe(true);
  });

  it('still parses an empty object — the ROUTE rejects empty patches (mirrors updateBlogSchema)', () => {
    // blogs precedent: zod stays permissive, route enforces "at least one field".
    expect(updateTemplateSchema.safeParse({}).success).toBe(true);
  });
});
