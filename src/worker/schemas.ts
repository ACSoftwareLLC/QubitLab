import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().min(1).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
});

export const updateUsernameSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const updateProfileSchema = z.object({
  firstName: z.string().max(64).optional().nullable(),
  lastName: z.string().max(64).optional().nullable(),
  bio: z.string().max(5000).optional().nullable(),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type UpdateUsernameBody = z.infer<typeof updateUsernameSchema>;
export type UpdatePasswordBody = z.infer<typeof updatePasswordSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;

export const gateOpSchema = z.object({
  id: z.number().int(),
  type: z.string().min(1).max(32),
  segment: z.number().int().min(0),
  targets: z.array(z.number().int().min(0)).max(16),
  controls: z.array(z.number().int().min(0)).max(16),
  angle: z.number().nullable(),
});

export const circuitSchema = z.object({
  numBits: z.number().int().min(1).max(16),
  ops: z.array(gateOpSchema).max(1000),
});

/** The circuit JSON stored in the `circuits.circuit` column. */
export type CircuitData = z.infer<typeof circuitSchema>;

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

export const createBlogSchema = z.object({
  slug: z.string().min(1).max(128).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50000),
  published: z.boolean().optional().default(true),
  publishAt: z.string().datetime().optional().nullable(),
});

export const updateBlogSchema = createBlogSchema.partial();

export type CreateBlogBody = z.infer<typeof createBlogSchema>;
export type UpdateBlogBody = z.infer<typeof updateBlogSchema>;

export const analyticsDaysParamSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const analyticsLimitParamSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const blogListParamSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const analyticsTrackBodySchema = z.object({
  type: z.enum(['page_view', 'event']),
  path: z.string().max(2048),
  sessionId: z.string().max(128),
  referrer: z.string().max(2048).optional(),
  timezone: z.string().max(128).optional(),
  language: z.string().max(64).optional(),
  country: z.string().max(128).optional(),
  screen: z.string().max(64).optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional().refine(
    (val) => {
      if (!val) return true;
      return JSON.stringify(val).length <= 1024;
    },
    { message: 'Metadata must be <= 1 KB when serialized' }
  ),
});

export type AnalyticsDaysParam = z.infer<typeof analyticsDaysParamSchema>;
export type AnalyticsLimitParam = z.infer<typeof analyticsLimitParamSchema>;
export type AnalyticsTrackBody = z.infer<typeof analyticsTrackBodySchema>;
export type BlogListParam = z.infer<typeof blogListParamSchema>;
