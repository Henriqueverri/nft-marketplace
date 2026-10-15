import { z } from 'zod'
import { networkIdSchema } from './catalog'
import { isoDateTimeSchema } from './common'

/**
 * Wallet contracts (fields from the "Carteiras" frame). Wallets are private: they
 * never appear in another user's responses.
 *
 * GET    /api/wallets                          → WalletList (the session user's)
 * POST   /api/wallets/:walletId/connection     → WalletConnection | 409 WALLET_REJECTED
 * GET    /api/wallets/:walletId/connection     → WalletConnection
 * DELETE /api/wallets/:walletId/connection     → WalletConnection (disconnected)
 *
 * The connection simulates the wallet app approving the site: no key or signature
 * exists. Creating and editing wallets (POST/PATCH) arrive with the wallets screen (F5).
 */

export const walletSlotSchema = z.enum(['primary', 'secondary'])
export type WalletSlot = z.infer<typeof walletSlotSchema>

export const walletProviderSchema = z.enum(['metamask', 'walletconnect', 'coinbase', 'phantom'])

export const walletSchema = z.object({
  id: z.string().regex(/^wal_[a-z0-9]+$/),
  slot: walletSlotSchema,
  displayName: z.string(),
  nickname: z.string(),
  networkId: networkIdSchema,
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$|^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  provider: walletProviderSchema,
  ensName: z.string().nullable(),
})
export type Wallet = z.infer<typeof walletSchema>

export const walletListSchema = z.object({ wallets: z.array(walletSchema) })
export type WalletList = z.infer<typeof walletListSchema>

export const walletConnectionSchema = z.object({
  walletId: walletSchema.shape.id,
  status: z.enum(['connected', 'disconnected']),
  connectedAt: isoDateTimeSchema.nullable(),
})
export type WalletConnection = z.infer<typeof walletConnectionSchema>
