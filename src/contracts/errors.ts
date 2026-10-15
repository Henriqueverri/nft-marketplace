import { z } from 'zod'

/**
 * Every non-2xx API response has the same body: `{ error: ApiErrorPayload }`.
 * Each code maps to exactly one HTTP status, so clients can branch on either.
 */
export const API_ERROR_STATUS = {
  VALIDATION_FAILED: 422,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  USERNAME_TAKEN: 409,
  CONFLICT: 409,
  STORAGE_FULL: 507,
  STORAGE_CORRUPTED: 500,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS

const apiErrorCodes = Object.keys(API_ERROR_STATUS) as [ApiErrorCode, ...ApiErrorCode[]]

export const apiErrorCodeSchema = z.enum(apiErrorCodes)

export const apiErrorPayloadSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
  /** Per-field messages for VALIDATION_FAILED, keyed by request field name. */
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
})
export type ApiErrorPayload = z.infer<typeof apiErrorPayloadSchema>

export const apiErrorBodySchema = z.object({ error: apiErrorPayloadSchema })
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
