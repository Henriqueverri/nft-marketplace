import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query'
import { RECONCILE_ON_RECONNECT_META } from '@/shared/realtime/context'
import {
  fetchFeatured,
  fetchNft,
  fetchNftList,
  fetchRecommendedNfts,
  fetchRelatedNfts,
  fetchReviews,
  type NftListParams,
} from './api'

/**
 * Catalog data is public: its keys never carry a user id. Queries holding prices or
 * stock are refetched after a realtime reconnection (events missed meanwhile are
 * never replayed).
 */
export const catalogKeys = {
  all: ['nfts'] as const,
  lists: () => ['nfts', 'list'] as const,
  list: (params: NftListParams) => ['nfts', 'list', params] as const,
  featured: () => ['nfts', 'featured'] as const,
  detail: (nftId: string) => ['nfts', 'detail', nftId] as const,
  related: (nftId: string) => ['nfts', 'related', nftId] as const,
  recommendations: (nftId: string) => ['nfts', 'recommendations', nftId] as const,
  reviews: (nftId: string) => ['nfts', 'reviews', nftId] as const,
}

export function nftListQueryOptions(params: NftListParams) {
  return queryOptions({
    queryKey: catalogKeys.list(params),
    queryFn: ({ signal }) => fetchNftList(params, signal),
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

/**
 * Each parameter set is its own cache entry, so a slow response for an old filter
 * can only fill its own entry and never replaces what the current URL shows. While
 * the new page loads, the previous results stay on screen (marked as updating).
 */
export function useNftList(params: NftListParams) {
  return useQuery({ ...nftListQueryOptions(params), placeholderData: keepPreviousData })
}

export function useFeatured() {
  return useQuery({
    queryKey: catalogKeys.featured(),
    queryFn: ({ signal }) => fetchFeatured(signal),
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

export function nftDetailQueryOptions(nftId: string) {
  return queryOptions({
    queryKey: catalogKeys.detail(nftId),
    queryFn: ({ signal }) => fetchNft(nftId, signal),
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

export function useNftDetail(nftId: string) {
  return useQuery(nftDetailQueryOptions(nftId))
}

export function useRelatedNfts(nftId: string) {
  return useQuery({
    queryKey: catalogKeys.related(nftId),
    queryFn: ({ signal }) => fetchRelatedNfts(nftId, signal),
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

export function useRecommendedNfts(nftId: string) {
  return useQuery({
    queryKey: catalogKeys.recommendations(nftId),
    queryFn: ({ signal }) => fetchRecommendedNfts(nftId, signal),
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

export function useReviews(nftId: string, enabled: boolean) {
  return useQuery({
    queryKey: catalogKeys.reviews(nftId),
    queryFn: ({ signal }) => fetchReviews(nftId, signal),
    enabled,
  })
}
