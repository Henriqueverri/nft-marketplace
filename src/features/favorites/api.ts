import { favoriteListResponseSchema, favoriteSchema, type Favorite } from '@/contracts/favorites'
import { http, parseResponse } from '@/shared/api/http'

export async function fetchFavorites(signal?: AbortSignal): Promise<Favorite[]> {
  const response = await http.get('/account/favorites', { signal })
  return parseResponse(favoriteListResponseSchema, response.data).items
}

export async function addFavorite(nftId: string): Promise<Favorite> {
  const response = await http.put(`/account/favorites/${encodeURIComponent(nftId)}`)
  return parseResponse(favoriteSchema, response.data)
}

export async function removeFavorite(nftId: string): Promise<void> {
  await http.delete(`/account/favorites/${encodeURIComponent(nftId)}`)
}
