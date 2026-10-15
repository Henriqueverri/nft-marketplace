import { z } from 'zod'
import { networkIdSchema } from './catalog'

/**
 * Wallet contracts (fields from the "Carteiras" frame). In F1 they type the seed;
 * GET/POST/PATCH /api/wallets arrive with checkout (F4) and the wallets screen (F5).
 * Wallets are private: they never appear in another user's responses.
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
