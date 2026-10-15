import { http, HttpResponse } from 'msw'
import {
  NEW_RELEASE_WINDOW_DAYS,
  nftIdSchema,
  nftListQuerySchema,
  TRENDING_MIN_POPULARITY,
  type FeaturedResponse,
  type Nft,
  type NftDetail,
  type NftListResponse,
  type ReviewListResponse,
} from '@/contracts/catalog'
import type { NftUpdatedEvent } from '@/contracts/events'
import { formatEth, parseEth } from '@/lib/eth'
import { readDb } from '../db/database'
import type { DbState } from '../db/schema'
import { withNetwork } from '../network'
import { createEnvelope } from '../socket'
import { apiError, validationError } from './respond'

const DAY_MS = 86_400_000
const RELATED_LIMIT = 8

type ListQuery = ReturnType<typeof nftListQuerySchema.parse>

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

/** Reads the query string: lists are comma-separated, empty values are absent. */
function readListQuery(url: URL) {
  const params = url.searchParams
  const value = (key: string) => {
    const raw = params.get(key)
    return raw === null || raw.trim() === '' ? undefined : raw
  }
  const list = (key: string) => value(key)?.split(',').filter(Boolean)
  return nftListQuerySchema
    .refine(
      (query) =>
        query.minPrice === undefined ||
        query.maxPrice === undefined ||
        parseEth(query.minPrice) <= parseEth(query.maxPrice),
      { message: 'O preço mínimo não pode ser maior que o máximo.', path: ['minPrice'] },
    )
    .safeParse({
      q: value('q'),
      collections: list('collections'),
      networks: list('networks'),
      minPrice: value('minPrice'),
      maxPrice: value('maxPrice'),
      view: value('view'),
      sort: value('sort'),
      page: value('page'),
      pageSize: value('pageSize'),
    })
}

type Dimension = 'collections' | 'networks'

/** Applies every filter of the query, except the dimension being faceted. */
function filterNfts(db: DbState, query: ListQuery, except?: Dimension): Nft[] {
  const collectionNames = new Map(db.collections.map((collection) => [collection.id, collection.name]))
  const search = query.q ? normalizeText(query.q) : ''
  const minWei = query.minPrice === undefined ? null : parseEth(query.minPrice)
  const maxWei = query.maxPrice === undefined ? null : parseEth(query.maxPrice)
  const newestListing = Math.max(...db.nfts.map((nft) => Date.parse(nft.listedAt)))
  const newSince = newestListing - NEW_RELEASE_WINDOW_DAYS * DAY_MS

  return db.nfts.filter((nft) => {
    if (search) {
      const haystack = normalizeText(
        [nft.name, collectionNames.get(nft.collectionId) ?? '', nft.creatorUsername, ...nft.attributes].join(' '),
      )
      if (!haystack.includes(search)) return false
    }
    if (except !== 'collections' && query.collections?.length && !query.collections.includes(nft.collectionId)) {
      return false
    }
    if (except !== 'networks' && query.networks?.length && !query.networks.includes(nft.networkId)) return false
    const price = parseEth(nft.priceEth)
    if (minWei !== null && price < minWei) return false
    if (maxWei !== null && price > maxWei) return false
    if (query.view === 'new' && Date.parse(nft.listedAt) < newSince) return false
    if (query.view === 'trending' && nft.popularity < TRENDING_MIN_POPULARITY) return false
    return true
  })
}

const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

function sortNfts(nfts: Nft[], sort: ListQuery['sort']): Nft[] {
  const byPrice = (a: Nft, b: Nft) => {
    const diff = parseEth(a.priceEth) - parseEth(b.priceEth)
    return diff === 0n ? 0 : diff < 0n ? -1 : 1
  }
  // Every order ends on the id, so pages are stable across requests.
  const tieBreak = (a: Nft, b: Nft) => a.id.localeCompare(b.id)
  const sorted = [...nfts]
  switch (sort) {
    case 'recent':
      return sorted.sort((a, b) => b.listedAt.localeCompare(a.listedAt) || tieBreak(a, b))
    case 'price-asc':
      return sorted.sort((a, b) => byPrice(a, b) || tieBreak(a, b))
    case 'price-desc':
      return sorted.sort((a, b) => byPrice(b, a) || tieBreak(a, b))
    case 'name':
      return sorted.sort((a, b) => nameCollator.compare(a.name, b.name) || tieBreak(a, b))
  }
}

function countBy<T extends { id: string; name: string }>(items: T[], nfts: Nft[], key: (nft: Nft) => string) {
  return items.map((item) => ({ id: item.id, name: item.name, count: nfts.filter((nft) => key(nft) === item.id).length }))
}

export function listNfts(db: DbState, query: ListQuery): NftListResponse {
  const matches = sortNfts(filterNfts(db, query), query.sort)
  const totalPages = Math.ceil(matches.length / query.pageSize)
  const start = (query.page - 1) * query.pageSize
  const prices = db.nfts.map((nft) => parseEth(nft.priceEth))
  return {
    items: matches.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    totalItems: matches.length,
    totalPages,
    facets: {
      collections: countBy(db.collections, filterNfts(db, query, 'collections'), (nft) => nft.collectionId),
      networks: countBy(db.networks, filterNfts(db, query, 'networks'), (nft) => nft.networkId),
      priceRange: {
        min: formatEth(prices.reduce((min, price) => (price < min ? price : min))),
        max: formatEth(prices.reduce((max, price) => (price > max ? price : max))),
      },
    },
  }
}

function findNft(db: DbState, rawId: unknown): Nft | undefined {
  const parsed = nftIdSchema.safeParse(rawId)
  return parsed.success ? db.nfts.find((nft) => nft.id === parsed.data) : undefined
}

function nftNotFound() {
  return apiError('NOT_FOUND', 'NFT não encontrado.')
}

function toDetail(db: DbState, nft: Nft): NftDetail {
  const reviews = db.reviews.filter((review) => review.nftId === nft.id)
  const total = reviews.reduce((sum, review) => sum + review.rating, 0)
  return {
    ...nft,
    collection: db.collections.find((collection) => collection.id === nft.collectionId)!,
    network: db.networks.find((network) => network.id === nft.networkId)!,
    rating: {
      average: reviews.length ? Math.round((total / reviews.length) * 10) / 10 : 0,
      count: reviews.length,
    },
  }
}

/** Event announcing the current state of an NFT; its version is the NFT version. */
export function nftUpdatedEvent(nft: Nft): NftUpdatedEvent {
  return createEnvelope('nft.updated', { kind: 'nft', id: nft.id }, nft.version, {
    nftId: nft.id,
    priceEth: nft.priceEth,
    compareAtPriceEth: nft.compareAtPriceEth,
    editions: nft.editions.map((edition) => ({
      id: edition.id,
      priceEth: edition.priceEth,
      available: edition.available,
    })),
  })
}

export const catalogHandlers = [
  http.get(
    '/api/nfts',
    withNetwork(async ({ request }) => {
      const parsed = readListQuery(new URL(request.url))
      if (!parsed.success) return validationError(parsed.error)
      return HttpResponse.json(listNfts(await readDb(), parsed.data))
    }),
  ),

  // Declared before /api/nfts/:nftId so that "featured" is never read as an id.
  http.get(
    '/api/nfts/featured',
    withNetwork(async () => {
      const db = await readDb()
      const byId = (id: string) => db.nfts.find((nft) => nft.id === id)!
      const body: FeaturedResponse = {
        slides: db.highlights.slideIds.map(byId),
        spotlight: byId(db.highlights.spotlightId),
      }
      return HttpResponse.json(body)
    }),
  ),

  http.get(
    '/api/nfts/:nftId',
    withNetwork(async ({ params }) => {
      const db = await readDb()
      const nft = findNft(db, params.nftId)
      if (!nft) return nftNotFound()
      return HttpResponse.json(toDetail(db, nft))
    }),
  ),

  http.get(
    '/api/nfts/:nftId/related',
    withNetwork(async ({ params }) => {
      const db = await readDb()
      const nft = findNft(db, params.nftId)
      if (!nft) return nftNotFound()
      const items = sortNfts(
        db.nfts.filter((candidate) => candidate.collectionId === nft.collectionId && candidate.id !== nft.id),
        'recent',
      ).slice(0, RELATED_LIMIT)
      return HttpResponse.json({ items })
    }),
  ),

  http.get(
    '/api/nfts/:nftId/recommendations',
    withNetwork(async ({ params }) => {
      const db = await readDb()
      const nft = findNft(db, params.nftId)
      if (!nft) return nftNotFound()
      const ids = db.recommendations[nft.id] ?? []
      const items = ids.map((id) => db.nfts.find((candidate) => candidate.id === id)).filter((item) => item !== undefined)
      return HttpResponse.json({ items })
    }),
  ),

  http.get(
    '/api/nfts/:nftId/reviews',
    withNetwork(async ({ params }) => {
      const db = await readDb()
      const nft = findNft(db, params.nftId)
      if (!nft) return nftNotFound()
      const body: ReviewListResponse = {
        items: db.reviews
          .filter((review) => review.nftId === nft.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      }
      return HttpResponse.json(body)
    }),
  ),
]
