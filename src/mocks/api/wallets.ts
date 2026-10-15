import { http, HttpResponse } from 'msw'
import {
  upsertWalletRequestSchema,
  walletSchema,
  walletSlotSchema,
  type Wallet,
  type WalletConnection,
  type WalletList,
} from '@/contracts/wallets'
import { readDb, transaction } from '../db/database'
import { withNetwork } from '../network'
import { getScenario } from '../scenarios'
import { apiError, readJson, validationError } from './respond'
import { requireSession } from './session'

/**
 * Wallets of the session user, and the simulated connection of a wallet app to the
 * site. Connections live in memory, like a wallet app's session: a reload of the
 * page that hosts the mock, a reset or POST /__mock/wallets/disconnect drops them.
 * With the `reject` wallet scenario, the wallet app refuses every connection.
 */

const connections = new Map<string, Map<string, string>>()

export function disconnectWallets(userId?: string): number {
  if (userId) {
    const count = connections.get(userId)?.size ?? 0
    connections.delete(userId)
    return count
  }
  const count = [...connections.values()].reduce((total, wallets) => total + wallets.size, 0)
  connections.clear()
  return count
}

function connectionOf(userId: string, walletId: string): WalletConnection {
  const connectedAt = connections.get(userId)?.get(walletId) ?? null
  return { walletId, status: connectedAt ? 'connected' : 'disconnected', connectedAt }
}

/** The user's wallet named in the path, or the error response (another user's is a 404). */
async function ownWallet(request: Request, walletId: unknown) {
  const auth = await requireSession(request)
  if (!auth.ok) return auth
  const id = walletSchema.shape.id.safeParse(walletId)
  const db = await readDb()
  const wallet = id.success ? db.walletsByUser[auth.user.id]?.find((candidate) => candidate.id === id.data) : undefined
  if (!wallet) return { ok: false as const, response: apiError('NOT_FOUND', 'Carteira não encontrada.') }
  return { ok: true as const, userId: auth.user.id, wallet }
}

export const walletHandlers = [
  http.get(
    '/api/wallets',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const db = await readDb()
      return HttpResponse.json<WalletList>({ wallets: db.walletsByUser[auth.user.id] ?? [] })
    }),
  ),

  http.put(
    '/api/wallets/:slot',
    withNetwork(async ({ request, params }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const slot = walletSlotSchema.safeParse(params.slot)
      if (!slot.success) return apiError('NOT_FOUND', 'Slot de carteira não encontrado.')
      const parsed = upsertWalletRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)
      if (parsed.data.sameAsPrimary && slot.data !== 'secondary') {
        return apiError('VALIDATION_FAILED', 'Somente a carteira secundária pode ser igual à principal.', {
          sameAsPrimary: ['Opção indisponível para a carteira principal.'],
        })
      }

      const result = await transaction((draft): Wallet | null => {
        const wallets = (draft.walletsByUser[auth.user.id] ??= [])
        const existing = wallets.find((wallet) => wallet.slot === slot.data)
        const primary = wallets.find((wallet) => wallet.slot === 'primary')
        if (parsed.data.sameAsPrimary && !primary) return null
        const fields = parsed.data.sameAsPrimary
          ? {
              displayName: primary!.displayName,
              nickname: primary!.nickname,
              networkId: primary!.networkId,
              address: primary!.address,
              provider: primary!.provider,
              ensName: primary!.ensName,
            }
          : {
              displayName: parsed.data.displayName,
              nickname: parsed.data.nickname,
              networkId: parsed.data.networkId,
              address: parsed.data.address,
              provider: parsed.data.provider,
              ensName: parsed.data.ensName,
            }
        const wallet: Wallet = {
          id:
            existing?.id ??
            `wal_${auth.user.id.replace(/^usr_/, '').replace(/[^a-z0-9]/g, '').slice(0, 12)}${slot.data === 'primary' ? 'p' : 's'}`,
          slot: slot.data,
          ...fields,
        }
        if (existing) Object.assign(existing, wallet)
        else wallets.push(wallet)
        return wallet
      })
      if (!result) {
        return apiError('VALIDATION_FAILED', 'Cadastre a carteira principal antes de copiar seus dados.', {
          sameAsPrimary: ['Cadastre a carteira principal primeiro.'],
        })
      }
      return HttpResponse.json(result)
    }),
  ),

  http.post(
    '/api/wallets/:walletId/connection',
    withNetwork(async ({ request, params }) => {
      const found = await ownWallet(request, params.walletId)
      if (!found.ok) return found.response
      if (getScenario().wallet === 'reject') {
        return apiError('WALLET_REJECTED', `A conexão com ${found.wallet.nickname} foi recusada na carteira.`)
      }
      const wallets = connections.get(found.userId) ?? new Map<string, string>()
      if (!wallets.has(found.wallet.id)) wallets.set(found.wallet.id, new Date().toISOString())
      connections.set(found.userId, wallets)
      return HttpResponse.json<WalletConnection>(connectionOf(found.userId, found.wallet.id))
    }),
  ),

  http.get(
    '/api/wallets/:walletId/connection',
    withNetwork(async ({ request, params }) => {
      const found = await ownWallet(request, params.walletId)
      if (!found.ok) return found.response
      return HttpResponse.json<WalletConnection>(connectionOf(found.userId, found.wallet.id))
    }),
  ),

  http.delete(
    '/api/wallets/:walletId/connection',
    withNetwork(async ({ request, params }) => {
      const found = await ownWallet(request, params.walletId)
      if (!found.ok) return found.response
      connections.get(found.userId)?.delete(found.wallet.id)
      return HttpResponse.json<WalletConnection>(connectionOf(found.userId, found.wallet.id))
    }),
  ),
]
