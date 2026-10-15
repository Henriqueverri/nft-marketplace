import { z } from 'zod'
import { nftSchema } from './catalog'
import { isoDateTimeSchema } from './common'

/**
 * Favorites ("Lista de interesse") of the authenticated user. The owner always comes
 * from the session token, never from the URL or the body.
 *
 * GET    /api/account/favorites          → FavoriteListResponse (newest first)
 * PUT    /api/account/favorites/:nftId   → Favorite (idempotent)
 * DELETE /api/account/favorites/:nftId   → 204 (idempotent)
 */

export const favoriteSchema = z.object({
  nft: nftSchema,
  addedAt: isoDateTimeSchema,
})
export type Favorite = z.infer<typeof favoriteSchema>

export const favoriteListResponseSchema = z.object({ items: z.array(favoriteSchema) })
export type FavoriteListResponse = z.infer<typeof favoriteListResponseSchema>
