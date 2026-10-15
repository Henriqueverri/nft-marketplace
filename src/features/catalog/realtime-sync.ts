import { useQueryClient } from '@tanstack/react-query'
import type { FeaturedResponse, Nft, NftDetail, NftListResponse } from '@/contracts/catalog'
import type { NftUpdatedEvent } from '@/contracts/events'
import type { Favorite } from '@/contracts/favorites'
import { syncCartWithNftUpdate } from '@/features/cart/queries'
import { favoriteKeys } from '@/features/favorites/queries'
import { formatEthDisplay } from '@/lib/eth'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { useRealtimeEvent } from '@/shared/realtime/context'
import { sessionStore } from '@/shared/session/session-store'
import type { NftListParams } from './api'
import { catalogKeys } from './queries'

/**
 * Applies `nft.updated` to one cached copy of an NFT. Only a strictly newer version
 * is applied, so duplicates, stale events and events older than a REST response
 * that is already in the cache never move the data backwards.
 */
export function applyNftUpdate<T extends Nft>(nft: T, event: NftUpdatedEvent): T {
  if (nft.id !== event.payload.nftId || event.version <= nft.version) return nft
  const editions = new Map(event.payload.editions.map((edition) => [edition.id, edition]))
  return {
    ...nft,
    priceEth: event.payload.priceEth,
    compareAtPriceEth: event.payload.compareAtPriceEth,
    version: event.version,
    editions: nft.editions.map((edition) => {
      const update = editions.get(edition.id)
      return update ? { ...edition, priceEth: update.priceEth, available: update.available } : edition
    }),
  }
}

function dependsOnPrice(params: NftListParams): boolean {
  return params.sort === 'price-asc' || params.sort === 'price-desc' || !!params.minPrice || !!params.maxPrice
}

/**
 * Keeps every cached copy of an NFT in step with `nft.updated`: detail, listings,
 * highlights, related lists and the current user's favorites, and refreshes the cart
 * when the NFT is in it (one subscription for the whole app). Mounted once for the
 * whole app; the event is public, and the only private entry it touches belongs to
 * the current session (the cache is reset on every session change).
 */
export function useNftRealtimeSync(): void {
  const queryClient = useQueryClient()
  const announce = useAnnounce()

  useRealtimeEvent('nft.updated', (event) => {
    let stale = false
    const patch = <T extends Nft>(nft: T): T => {
      if (nft.id === event.payload.nftId && nft.version >= event.version) stale = true
      return applyNftUpdate(nft, event)
    }
    const patchList = <T extends Nft>(items: T[]) => items.map(patch)

    const detailKey = catalogKeys.detail(event.payload.nftId)
    const before = queryClient.getQueryData<NftDetail>(detailKey)
    queryClient.setQueryData<NftDetail>(detailKey, (detail) => detail && patch(detail))
    queryClient.setQueriesData<NftListResponse>({ queryKey: catalogKeys.lists() }, (data) =>
      data && { ...data, items: patchList(data.items) },
    )
    queryClient.setQueryData<FeaturedResponse>(catalogKeys.featured(), (data) =>
      data && { slides: patchList(data.slides), spotlight: patch(data.spotlight) },
    )
    for (const prefix of [['nfts', 'related'], ['nfts', 'recommendations']]) {
      queryClient.setQueriesData<Nft[]>({ queryKey: prefix }, (items) => items && patchList(items))
    }
    const { userId } = sessionStore.getSnapshot()
    if (userId) {
      queryClient.setQueryData<Favorite[]>(favoriteKeys.list(userId), (list) =>
        list?.map((favorite) => ({ ...favorite, nft: patch(favorite.nft) })),
      )
    }
    // The cart is not patched locally: its prices and limits come only from the server.
    syncCartWithNftUpdate(queryClient, event)
    if (stale) return

    // A new price can move an NFT to another page or in or out of a price range.
    void queryClient.invalidateQueries({
      queryKey: catalogKeys.lists(),
      predicate: (query) => dependsOnPrice(query.queryKey[2] as NftListParams),
    })

    const observed = (queryClient.getQueryCache().find({ queryKey: detailKey })?.getObserversCount() ?? 0) > 0
    if (observed && before && before.priceEth !== event.payload.priceEth) {
      announce(`Preço de ${before.name} atualizado para ${formatEthDisplay(event.payload.priceEth)} ETH.`)
    }
  })
}
