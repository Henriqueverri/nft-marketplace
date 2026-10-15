import { queryOptions, useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { Nft } from '@/contracts/catalog'
import type { Favorite } from '@/contracts/favorites'
import { useSessionSnapshot } from '@/features/auth/queries'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { errorMessage } from '@/shared/forms/form-errors'
import { RECONCILE_ON_RECONNECT_META } from '@/shared/realtime/context'
import { privateQueryKey } from '@/shared/session/query-keys'
import { sessionStore } from '@/shared/session/session-store'
import { addFavorite, fetchFavorites, removeFavorite } from './api'

export const favoriteKeys = {
  list: (userId: string) => privateQueryKey(userId, 'favorites'),
}

export function favoritesQueryOptions(userId: string) {
  return queryOptions({
    queryKey: favoriteKeys.list(userId),
    queryFn: ({ signal }) => fetchFavorites(signal),
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

/** Favorites of the signed-in user; idle for visitors. */
export function useFavorites() {
  const { userId } = useSessionSnapshot()
  return useQuery({ ...favoritesQueryOptions(userId ?? ''), enabled: userId !== null })
}

/** Ids of the current user's favorites, to mark cards and the detail button. */
export function useFavoriteIds(): { ids: ReadonlySet<string>; ready: boolean } {
  const favorites = useFavorites()
  const ids = useMemo(() => new Set(favorites.data?.map((favorite) => favorite.nft.id)), [favorites.data])
  return { ids, ready: favorites.isSuccess }
}

function withFavorite(list: Favorite[] | undefined, nft: Nft, addedAt: string): Favorite[] | undefined {
  if (!list) return list
  if (list.some((favorite) => favorite.nft.id === nft.id)) return list
  return [{ nft, addedAt }, ...list]
}

function withoutFavorite(list: Favorite[] | undefined, nftId: string): Favorite[] | undefined {
  return list?.filter((favorite) => favorite.nft.id !== nftId)
}

interface ToggleVariables {
  nft: Nft
  favorite: boolean
}

function toggleMutationKey(userId: string) {
  return ['favorites', 'toggle', userId] as const
}

/**
 * Latest toggle started per `userId:nftId`. A failed toggle is rolled back only while
 * it is still the latest one for its NFT, so a late failure never undoes a newer change.
 */
const latestToggle = new Map<string, symbol>()

/**
 * True while a toggle of this NFT is pending, wherever it was started (a card, then
 * the detail page of the same NFT): one change per NFT at a time.
 */
export function useFavoritePending(userId: string | null, nftId: string): boolean {
  const pending = useIsMutating({
    mutationKey: toggleMutationKey(userId ?? ''),
    predicate: (mutation) => (mutation.state.variables as ToggleVariables | undefined)?.nft.id === nftId,
  })
  return userId !== null && pending > 0
}

/**
 * Optimistic toggle. The list changes at once; on failure only this NFT's change is
 * undone (not a snapshot of the whole list, which would also undo concurrent toggles
 * of other NFTs) and the error is announced. The list is then refetched from REST.
 * Writes are skipped when the session changed meanwhile: the key belongs to the old
 * user and the cache was already reset.
 */
export function useToggleFavorite(userId: string) {
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const key = favoriteKeys.list(userId)
  const sameUser = () => sessionStore.getSnapshot().userId === userId
  const mutationKey = toggleMutationKey(userId)

  return useMutation({
    mutationKey,
    mutationFn: async ({ nft, favorite }: ToggleVariables): Promise<void> => {
      if (favorite) await addFavorite(nft.id)
      else await removeFavorite(nft.id)
    },
    onMutate: async ({ nft, favorite }) => {
      const token = Symbol(nft.id)
      latestToggle.set(`${userId}:${nft.id}`, token)
      await queryClient.cancelQueries({ queryKey: key })
      queryClient.setQueryData<Favorite[]>(key, (list) =>
        favorite ? withFavorite(list, nft, new Date().toISOString()) : withoutFavorite(list, nft.id),
      )
      return { token }
    },
    onSuccess: (_data, { nft, favorite }) => {
      if (!sameUser()) return
      announce(favorite ? `${nft.name} adicionado à lista de interesse.` : `${nft.name} removido da lista de interesse.`)
    },
    onError: (error, { nft, favorite }, context) => {
      if (!sameUser()) return
      if (context && latestToggle.get(`${userId}:${nft.id}`) === context.token) {
        queryClient.setQueryData<Favorite[]>(key, (list) =>
          favorite ? withoutFavorite(list, nft.id) : withFavorite(list, nft, new Date().toISOString()),
        )
      }
      announce(
        `Não foi possível ${favorite ? 'favoritar' : 'remover'} ${nft.name}. ${errorMessage(error)}`,
      )
    },
    onSettled: (_data, _error, { nft }, context) => {
      const latestKey = `${userId}:${nft.id}`
      if (context && latestToggle.get(latestKey) === context.token) latestToggle.delete(latestKey)
      if (!sameUser()) return
      // Only the last pending toggle refetches: an earlier refetch would overwrite the
      // optimistic state of toggles still in flight.
      if (queryClient.isMutating({ mutationKey }) === 1) void queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
