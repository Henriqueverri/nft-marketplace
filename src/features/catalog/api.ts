import {
  featuredResponseSchema,
  nftDetailSchema,
  nftListOnlySchema,
  nftListResponseSchema,
  reviewListResponseSchema,
  type FeaturedResponse,
  type Nft,
  type NftDetail,
  type NftListResponse,
  type NftSort,
  type NftView,
  type Review,
} from '@/contracts/catalog'
import { http, parseResponse } from '@/shared/api/http'

/** Listing parameters as the app holds them (normalized from the URL). */
export interface NftListParams {
  q?: string
  collections: string[]
  networks: string[]
  minPrice?: string
  maxPrice?: string
  view: NftView
  sort: NftSort
  page: number
}

/** Serializes lists as comma-separated values and leaves absent filters out. */
function toQueryString(params: NftListParams): Record<string, string> {
  const query: Record<string, string> = { view: params.view, sort: params.sort, page: String(params.page) }
  if (params.q) query.q = params.q
  if (params.collections.length) query.collections = params.collections.join(',')
  if (params.networks.length) query.networks = params.networks.join(',')
  if (params.minPrice !== undefined) query.minPrice = params.minPrice
  if (params.maxPrice !== undefined) query.maxPrice = params.maxPrice
  return query
}

export async function fetchNftList(params: NftListParams, signal?: AbortSignal): Promise<NftListResponse> {
  const response = await http.get('/nfts', { params: toQueryString(params), signal })
  return parseResponse(nftListResponseSchema, response.data)
}

export async function fetchFeatured(signal?: AbortSignal): Promise<FeaturedResponse> {
  const response = await http.get('/nfts/featured', { signal })
  return parseResponse(featuredResponseSchema, response.data)
}

export async function fetchNft(nftId: string, signal?: AbortSignal): Promise<NftDetail> {
  const response = await http.get(`/nfts/${encodeURIComponent(nftId)}`, { signal })
  return parseResponse(nftDetailSchema, response.data)
}

export async function fetchRelatedNfts(nftId: string, signal?: AbortSignal): Promise<Nft[]> {
  const response = await http.get(`/nfts/${encodeURIComponent(nftId)}/related`, { signal })
  return parseResponse(nftListOnlySchema, response.data).items
}

export async function fetchRecommendedNfts(nftId: string, signal?: AbortSignal): Promise<Nft[]> {
  const response = await http.get(`/nfts/${encodeURIComponent(nftId)}/recommendations`, { signal })
  return parseResponse(nftListOnlySchema, response.data).items
}

export async function fetchReviews(nftId: string, signal?: AbortSignal): Promise<Review[]> {
  const response = await http.get(`/nfts/${encodeURIComponent(nftId)}/reviews`, { signal })
  return parseResponse(reviewListResponseSchema, response.data).items
}
