import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
  turnstileToken: z.string().min(1).optional(),
});

export const loginSchema = registerSchema;

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
