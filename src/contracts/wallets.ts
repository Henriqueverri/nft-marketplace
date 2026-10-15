import { z } from 'zod'
import { networkIdSchema } from './catalog'
import { isoDateTimeSchema } from './common'

/**
 * Wallet contracts (fields from the "Carteiras" frame). Wallets are private: they
 * never appear in another user's responses.
 *
 * GET    /api/wallets                          → WalletList (the session user's)
 * PUT    /api/wallets/:slot                    → Wallet (create or replace a slot)
 * POST   /api/wallets/:walletId/connection     → WalletConnection | 409 WALLET_REJECTED
 * GET    /api/wallets/:walletId/connection     → WalletConnection
 * DELETE /api/wallets/:walletId/connection     → WalletConnection (disconnected)
 *
 * The connection simulates the wallet app approving the site: no key or signature
 * exists.
 */

export const walletSlotSchema = z.enum(['primary', 'secondary'])
export type WalletSlot = z.infer<typeof walletSlotSchema>

export const walletProviderSchema = z.enum(['metamask', 'walletconnect', 'coinbase', 'phantom'])
export type WalletProvider = z.infer<typeof walletProviderSchema>

const evmAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Informe um endereço EVM válido.')
const solanaAddressSchema = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Informe um endereço Solana válido.')

export const walletAddressSchema = z.string().min(1, 'Informe o endereço da carteira.')

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

const walletFieldsSchema = z
  .object({
    displayName: z.string().trim().min(2, 'Informe o nome do titular.').max(40, 'Use no máximo 40 caracteres.'),
    nickname: z.string().trim().min(2, 'Informe um apelido.').max(40, 'Use no máximo 40 caracteres.'),
    networkId: networkIdSchema,
    address: walletAddressSchema,
    provider: walletProviderSchema,
    ensName: z
      .string()
      .trim()
      .max(80, 'Use no máximo 80 caracteres.')
      .transform((value) => value || null)
      .nullable(),
  })
  .superRefine((wallet, context) => {
    const schema = wallet.networkId === 'solana' ? solanaAddressSchema : evmAddressSchema
    const parsed = schema.safeParse(wallet.address)
    if (!parsed.success) {
      context.addIssue({ code: 'custom', path: ['address'], message: parsed.error.issues[0].message })
    }
  })

/** PUT /api/wallets/:slot. Secondary may copy the complete primary wallet data. */
export const upsertWalletRequestSchema = z.union([
  walletFieldsSchema.extend({ sameAsPrimary: z.literal(false).optional() }),
  z.object({ sameAsPrimary: z.literal(true) }),
])
export type UpsertWalletRequest = z.input<typeof upsertWalletRequestSchema>

export const walletListSchema = z.object({ wallets: z.array(walletSchema) })
export type WalletList = z.infer<typeof walletListSchema>

export const walletConnectionSchema = z.object({
  walletId: walletSchema.shape.id,
  status: z.enum(['connected', 'disconnected']),
  connectedAt: isoDateTimeSchema.nullable(),
})
export type WalletConnection = z.infer<typeof walletConnectionSchema>
