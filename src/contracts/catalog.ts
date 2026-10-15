import { z } from 'zod'
import { ethAmountSchema, isoDateTimeSchema } from './common'
import { paginatedSchema } from './pagination'

/**
 * Catalog contracts: the records of the mock database and the read-only REST API
 * (GET /api/nfts, /api/nfts/featured, /api/nfts/:id and its related lists).
 */

export const networkIdSchema = z.enum(['ethereum', 'polygon', 'solana'])
export type NetworkId = z.infer<typeof networkIdSchema>

export const networkSchema = z.object({
  id: networkIdSchema,
  name: z.string(),
  currency: z.string(),
  explorerUrl: z.url(),
})
export type Network = z.infer<typeof networkSchema>

export const collectionIdSchema = z.string().regex(/^col_[a-z0-9-]+$/)

export const collectionSchema = z.object({
  id: collectionIdSchema,
  name: z.string(),
})
export type Collection = z.infer<typeof collectionSchema>

export const editionSchema = z.object({
  id: z.string().regex(/^ed_[a-z0-9-]+$/),
  name: z.string(),
  priceEth: ethAmountSchema,
  supply: z.number().int().positive(),
  available: z.number().int().nonnegative(),
  /** Upper bound per order; the effective limit is min(maxPerOrder, available). */
  maxPerOrder: z.number().int().positive(),
})
export type Edition = z.infer<typeof editionSchema>

export const nftRaritySchema = z.enum(['common', 'rare'])

export const nftImageKeySchema = z.enum(['ape-sunglasses', 'gorilla-hat', 'monkey-headphones', 'gorilla-suit'])
export type NftImageKey = z.infer<typeof nftImageKeySchema>

export const nftIdSchema = z.string().regex(/^[a-z0-9-]+$/).max(80)

export const nftSchema = z.object({
  id: nftIdSchema,
  name: z.string(),
  tokenId: z.string(),
  description: z.string(),
  collectionId: collectionIdSchema,
  networkId: networkIdSchema,
  creatorUsername: z.string(),
  /** Key of a local, bundled artwork (the Figma file ships four artworks). */
  imageKey: nftImageKeySchema,
  rarity: nftRaritySchema,
  attributes: z.array(z.string()).max(6),
  /** 0–100; the "Em alta" (trending) view lists NFTs at or above TRENDING_MIN_POPULARITY. */
  popularity: z.number().int().min(0).max(100),
  contractAddress: z.string().regex(/^0x[0-9a-f]{40}$/),
  royaltyPercent: z.number().int().min(0).max(20),
  /** Lowest current edition price. */
  priceEth: ethAmountSchema,
  /** Previous price, shown struck through when the NFT is discounted. */
  compareAtPriceEth: ethAmountSchema.nullable(),
  editions: z.array(editionSchema).min(1),
  listedAt: isoDateTimeSchema,
  /** Grows on every price or availability change (nft.updated carries it). */
  version: z.number().int().positive(),
})
export type Nft = z.infer<typeof nftSchema>

/* ---------- Listing: GET /api/nfts ---------- */

export const nftSortSchema = z.enum(['recent', 'price-asc', 'price-desc', 'name'])
export type NftSort = z.infer<typeof nftSortSchema>

/** Catalog tabs of the Figma: all, new releases, trending. */
export const nftViewSchema = z.enum(['all', 'new', 'trending'])
export type NftView = z.infer<typeof nftViewSchema>

export const CATALOG_PAGE_SIZE = 9
export const SEARCH_MAX_LENGTH = 60
/** "Novos lançamentos": listed at most this many days before the newest listing. */
export const NEW_RELEASE_WINDOW_DAYS = 14
export const TRENDING_MIN_POPULARITY = 70

/**
 * Query of the listing. Over HTTP every field is a query-string value and lists are
 * comma-separated (`collections=col_a,col_b`). Prices are decimal ETH strings.
 */
export const nftListQuerySchema = z
  .object({
    q: z.string().trim().max(SEARCH_MAX_LENGTH).optional(),
    collections: z.array(collectionIdSchema).max(20).optional(),
    networks: z.array(networkIdSchema).max(3).optional(),
    minPrice: ethAmountSchema.optional(),
    maxPrice: ethAmountSchema.optional(),
    view: nftViewSchema.default('all'),
    sort: nftSortSchema.default('recent'),
    page: z.coerce.number().int().min(1).max(1000).default(1),
    pageSize: z.coerce.number().int().min(1).max(48).default(CATALOG_PAGE_SIZE),
  })
export type NftListQuery = z.input<typeof nftListQuerySchema>

const facetSchema = z.object({ id: z.string(), name: z.string(), count: z.number().int().nonnegative() })

export const nftListResponseSchema = paginatedSchema(nftSchema).extend({
  /**
   * Counts per collection and per network. Each facet applies every other active
   * filter except its own, so the counts show what selecting an option would add.
   */
  facets: z.object({
    collections: z.array(facetSchema),
    networks: z.array(facetSchema),
    /** Bounds of the whole catalog, for the price slider. */
    priceRange: z.object({ min: ethAmountSchema, max: ethAmountSchema }),
  }),
})
export type NftListResponse = z.infer<typeof nftListResponseSchema>

/* ---------- Highlights, detail and related lists ---------- */

/** GET /api/nfts/featured: hero slides and the sidebar spotlight. */
export const featuredResponseSchema = z.object({
  slides: z.array(nftSchema).min(1),
  spotlight: nftSchema,
})
export type FeaturedResponse = z.infer<typeof featuredResponseSchema>

/** GET /api/nfts/:id. */
export const nftDetailSchema = nftSchema.extend({
  collection: collectionSchema,
  network: networkSchema,
  rating: z.object({
    /** One decimal place; 0 when there are no reviews. */
    average: z.number().min(0).max(5),
    count: z.number().int().nonnegative(),
  }),
})
export type NftDetail = z.infer<typeof nftDetailSchema>

/** GET /api/nfts/:id/related (same collection) and /recommendations (seen by other collectors). */
export const nftListOnlySchema = z.object({ items: z.array(nftSchema) })
export type NftListOnly = z.infer<typeof nftListOnlySchema>

export const reviewSchema = z.object({
  id: z.string().regex(/^rev_[a-z0-9-]+$/),
  nftId: nftIdSchema,
  authorUsername: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  createdAt: isoDateTimeSchema,
})
export type Review = z.infer<typeof reviewSchema>

/** GET /api/nfts/:id/reviews (read-only; newest first). */
export const reviewListResponseSchema = z.object({ items: z.array(reviewSchema) })
export type ReviewListResponse = z.infer<typeof reviewListResponseSchema>
