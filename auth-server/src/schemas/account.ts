import { z } from 'zod';
import { registerSchema } from './auth.js';

export const updateUsernameSchema = z.object({
  username: registerSchema.shape.username,
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

export type UpdateUsernameBody = z.infer<typeof updateUsernameSchema>;
export type UpdatePasswordBody = z.infer<typeof updatePasswordSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
