import { http, HttpResponse } from 'msw'
import { nftIdSchema } from '@/contracts/catalog'
import type { Favorite, FavoriteListResponse } from '@/contracts/favorites'
import { readDb, transaction } from '../db/database'
import type { DbState } from '../db/schema'
import { withNetwork } from '../network'
import { apiError } from './respond'
import { requireSession } from './session'

/**
 * Favorites of the authenticated user. The owner is always the session user: no
 * route accepts a user id, so one user can never read or change another's list.
 */

export function listFavorites(db: DbState, userId: string): Favorite[] {
  return (db.favoritesByUser[userId] ?? [])
    .map((record) => {
      const nft = db.nfts.find((candidate) => candidate.id === record.nftId)
      return nft ? { nft, addedAt: record.addedAt } : null
    })
    .filter((favorite) => favorite !== null)
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
}

async function resolveNftId(rawId: unknown): Promise<string | null> {
  const parsed = nftIdSchema.safeParse(rawId)
  if (!parsed.success) return null
  const db = await readDb()
  return db.nfts.some((nft) => nft.id === parsed.data) ? parsed.data : null
}

export const favoriteHandlers = [
  http.get(
    '/api/account/favorites',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const body: FavoriteListResponse = { items: listFavorites(await readDb(), auth.user.id) }
      return HttpResponse.json(body)
    }),
  ),

  /** Idempotent: favoriting twice keeps the original date. */
  http.put(
    '/api/account/favorites/:nftId',
    withNetwork(async ({ request, params }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const nftId = await resolveNftId(params.nftId)
      if (!nftId) return apiError('NOT_FOUND', 'NFT não encontrado.')

      const favorite = await transaction((draft) => {
        const favorites = (draft.favoritesByUser[auth.user.id] ??= [])
        let record = favorites.find((candidate) => candidate.nftId === nftId)
        if (!record) {
          record = { nftId, addedAt: new Date().toISOString() }
          favorites.push(record)
        }
        return { nft: draft.nfts.find((nft) => nft.id === nftId)!, addedAt: record.addedAt }
      })
      return HttpResponse.json(favorite)
    }),
  ),

  /** Idempotent: removing an NFT that is not a favorite still answers 204. */
  http.delete(
    '/api/account/favorites/:nftId',
    withNetwork(async ({ request, params }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const nftId = await resolveNftId(params.nftId)
      if (!nftId) return apiError('NOT_FOUND', 'NFT não encontrado.')

      await transaction((draft) => {
        const favorites = draft.favoritesByUser[auth.user.id] ?? []
        draft.favoritesByUser[auth.user.id] = favorites.filter((candidate) => candidate.nftId !== nftId)
      })
      return new HttpResponse(null, { status: 204 })
    }),
  ),
]
