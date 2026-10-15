import { z } from 'zod'
import { ethAmountSchema, isoDateTimeSchema } from './common'

/**
 * Catalog contracts. In F1 they type the mock seed and its integrity check;
 * the REST endpoints that return them (GET /api/nfts, /api/nfts/:id) arrive in F2.
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

export const collectionSchema = z.object({
  id: z.string().regex(/^col_[a-z0-9-]+$/),
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

export const nftSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  tokenId: z.string(),
  description: z.string(),
  collectionId: collectionSchema.shape.id,
  networkId: networkIdSchema,
  creatorUsername: z.string(),
  /** Key of a local, bundled artwork (the Figma file ships four artworks). */
  imageKey: z.enum(['ape-sunglasses', 'gorilla-hat', 'monkey-headphones', 'gorilla-suit']),
  rarity: nftRaritySchema,
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
