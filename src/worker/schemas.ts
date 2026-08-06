import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8),
  turnstileToken: z.string().min(1).optional(),
});

export const loginSchema = registerSchema.omit({ turnstileToken: true });

export const updateUsernameSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
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
