import { z } from 'zod'
import { isoDateTimeSchema, userIdSchema } from './common'

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Use pelo menos 3 caracteres.')
  .max(24, 'Use no máximo 24 caracteres.')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Use apenas letras, números, ponto, hífen ou sublinhado.')

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Use pelo menos 2 caracteres.')
  .max(40, 'Use no máximo 40 caracteres.')

/** Visible to any user (e.g. as a creator or owner). Never carries contact data. */
export const publicUserSchema = z.object({
  id: userIdSchema,
  username: z.string(),
  avatarUrl: z.string().nullable(),
})
export type PublicUser = z.infer<typeof publicUserSchema>

/** The signed-in user's own account, returned with the session. */
export const accountUserSchema = publicUserSchema.extend({
  email: z.email(),
  displayName: z.string(),
})
export type AccountUser = z.infer<typeof accountUserSchema>

/**
 * Private profile, readable only by its owner (GET /api/me).
 * `version` grows on every change; realtime events carry it so stale updates are ignored.
 */
export const accountProfileSchema = accountUserSchema.extend({
  ensName: z.string().nullable(),
  walletNickname: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  version: z.number().int().positive(),
})
export type AccountProfile = z.infer<typeof accountProfileSchema>

/** PATCH /api/me. Only fields present in the known profile layout are writable. */
export const updateProfileRequestSchema = z.object({
  displayName: displayNameSchema,
})
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>

const avatarDataUrlSchema = z
  .string()
  .max(500_000, 'A imagem é grande demais.')
  .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Envie uma imagem PNG, JPEG ou WebP.')

/** PUT /api/me/avatar. `null` removes the current avatar. */
export const updateAvatarRequestSchema = z.object({
  avatarUrl: avatarDataUrlSchema.nullable(),
})
export type UpdateAvatarRequest = z.infer<typeof updateAvatarRequestSchema>
