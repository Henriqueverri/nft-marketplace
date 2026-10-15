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
  /** Cart: the quantity would exceed min(maxPerOrder, available) of the edition. */
  QUANTITY_LIMIT_EXCEEDED: 409,
  /** Cart: the edition has no stock left. */
  OUT_OF_STOCK: 409,
  /** Quote: the cart changed since the revision the client asked to quote. */
  CART_CHANGED: 409,
  /** Cart: a visitor write to a cart id that was already merged into an account. */
  CART_MERGED: 409,
  COUPON_INVALID: 422,
  COUPON_EXPIRED: 422,
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
