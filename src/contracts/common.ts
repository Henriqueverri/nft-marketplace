import { z } from 'zod'

/** Opaque identifiers. The prefix makes cross-resource mix-ups visible in logs and tests. */
export const userIdSchema = z.string().regex(/^usr_[a-z0-9]+$/)
export type UserId = z.infer<typeof userIdSchema>

export const isoDateTimeSchema = z.iso.datetime()

/**
 * ETH amounts travel as decimal strings (at most 18 fractional digits) to keep full
 * precision; arithmetic happens in wei with bigint (src/lib/eth.ts).
 */
export const ethAmountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d{1,18})?$/, 'Valor em ETH inválido')
export type EthAmount = z.infer<typeof ethAmountSchema>
