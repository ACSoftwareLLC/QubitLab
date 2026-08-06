import { z } from 'zod';

// Mirrors the frontend contract in src/api/types.ts
export const gateOpSchema = z.object({
  id: z.number().int(),
  type: z.string().min(1),
  segment: z.number().int().min(0),
  targets: z.array(z.number().int().min(0)),
  controls: z.array(z.number().int().min(0)),
  angle: z.number().nullable(),
});

export const circuitSchema = z.object({
  numBits: z.number().int().min(1).max(16),
  ops: z.array(gateOpSchema),
});

const thumbnailSchema = z
  .string()
  .regex(/^data:image\/png;base64,/, 'Thumbnail must be a PNG data URL')
  .max(5_000_000);

export const createCircuitSchema = z.object({
  name: z.string().min(1).max(80),
  circuit: circuitSchema,
  thumbnail: thumbnailSchema.optional(),
});

export const updateCircuitSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    circuit: circuitSchema.optional(),
    thumbnail: thumbnailSchema.optional(),
    shared: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.circuit !== undefined ||
      v.thumbnail !== undefined ||
      v.shared !== undefined,
    {
      message: 'At least one field must be provided',
    }
  );

export type CreateCircuitBody = z.infer<typeof createCircuitSchema>;
export type UpdateCircuitBody = z.infer<typeof updateCircuitSchema>;
