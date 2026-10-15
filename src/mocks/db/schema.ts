import { z } from 'zod'
import { cartItemIdSchema, cartNoticeSchema, guestCartIdSchema, quantitySchema, quoteSchema } from '@/contracts/cart'
import { idempotencyKeySchema, orderIdSchema, orderSchema } from '@/contracts/orders'
import { collectionSchema, networkSchema, nftIdSchema, nftSchema, reviewSchema } from '@/contracts/catalog'
import { ethAmountSchema, isoDateTimeSchema, userIdSchema } from '@/contracts/common'
import { walletSchema } from '@/contracts/wallets'
import { PASSWORD_KDF } from './password'

/**
 * Shape of the persisted mock database. It is validated on every load, so a
 * corrupted or tampered copy is detected instead of being used.
 * Private data (credentials, sessions, wallets, favorites) is keyed by user id.
 */

export const DB_SCHEMA_VERSION = 3

const userRecordSchema = z.object({
  id: userIdSchema,
  username: z.string(),
  email: z.email(),
  displayName: z.string(),
  ensName: z.string().nullable(),
  walletNickname: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  profileVersion: z.number().int().positive(),
})
export type UserRecord = z.infer<typeof userRecordSchema>

const credentialRecordSchema = z.object({
  userId: userIdSchema,
  algorithm: z.literal(PASSWORD_KDF.algorithm),
  iterations: z.number().int().positive(),
  salt: z.string(),
  hash: z.string(),
})
export type CredentialRecord = z.infer<typeof credentialRecordSchema>

const sessionRecordSchema = z.object({
  id: z.string(),
  userId: userIdSchema,
  /** SHA-256 hex digest of the opaque token; the token itself is never stored. */
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
})
export type SessionRecord = z.infer<typeof sessionRecordSchema>

const favoriteRecordSchema = z.object({ nftId: nftIdSchema, addedAt: isoDateTimeSchema })
export type FavoriteRecord = z.infer<typeof favoriteRecordSchema>

const cartLineRecordSchema = z.object({
  nftId: nftIdSchema,
  editionId: cartItemIdSchema,
  quantity: quantitySchema,
  /** Price the user was last shown; a different catalog price produces a notice. */
  unitPriceEth: ethAmountSchema,
  addedAt: isoDateTimeSchema,
})
export type CartLineRecord = z.infer<typeof cartLineRecordSchema>

const cartRecordSchema = z.object({
  revision: z.number().int().nonnegative(),
  lines: z.array(cartLineRecordSchema),
  couponCode: z.string().nullable(),
  notices: z.array(cartNoticeSchema),
  updatedAt: isoDateTimeSchema,
})
export type CartRecord = z.infer<typeof cartRecordSchema>

const couponRecordSchema = z.object({
  code: z.string(),
  percentOff: z.number().int().min(1).max(100),
  expiresAt: isoDateTimeSchema,
})
export type CouponRecord = z.infer<typeof couponRecordSchema>

/** A quote the server sent to a user; only these can back an order. */
const issuedQuoteRecordSchema = z.object({
  quote: quoteSchema,
  expiresAt: isoDateTimeSchema,
  /** The order created from it; a quote backs at most one order. */
  orderId: orderIdSchema.nullable(),
})
export type IssuedQuoteRecord = z.infer<typeof issuedQuoteRecordSchema>

const orderRecordSchema = z.object({
  userId: userIdSchema,
  idempotencyKey: idempotencyKeySchema,
  /** Canonical JSON of the validated request: same key with another payload is a conflict. */
  requestFingerprint: z.string(),
  /** Outcome the payment scenario planned at creation; null holds it pending. */
  plannedOutcome: z.enum(['confirmed', 'rejected']).nullable(),
  settlesAt: isoDateTimeSchema.nullable(),
  /** The public order, receipt included, exactly as the API returns it. */
  order: orderSchema,
})
export type OrderRecord = z.infer<typeof orderRecordSchema>

export const dbStateSchema = z.object({
  schemaVersion: z.literal(DB_SCHEMA_VERSION),
  seedVersion: z.number().int(),
  users: z.array(userRecordSchema),
  credentials: z.array(credentialRecordSchema),
  sessions: z.array(sessionRecordSchema),
  walletsByUser: z.record(userIdSchema, z.array(walletSchema)),
  networks: z.array(networkSchema),
  collections: z.array(collectionSchema),
  nfts: z.array(nftSchema),
  /** Home highlights: hero slides and the sidebar spotlight. */
  highlights: z.object({ slideIds: z.array(nftIdSchema).min(1), spotlightId: nftIdSchema }),
  reviews: z.array(reviewSchema),
  /** "Colecionadores também viram", by NFT id. */
  recommendations: z.record(nftIdSchema, z.array(nftIdSchema)),
  favoritesByUser: z.record(userIdSchema, z.array(favoriteRecordSchema)),
  /** Account carts by user id. */
  cartsByUser: z.record(userIdSchema, cartRecordSchema),
  /** Visitor carts by the X-Cart-Id the client generated. */
  guestCarts: z.record(guestCartIdSchema, cartRecordSchema),
  /**
   * Visitor cart ids already merged into an account, with the merge time. A visitor
   * write that arrives after the merge is refused instead of recreating the cart.
   */
  mergedGuestCarts: z.record(guestCartIdSchema, isoDateTimeSchema),
  coupons: z.array(couponRecordSchema),
  /** Quotes issued to each user (the most recent ones), checked when an order is created. */
  issuedQuotes: z.record(userIdSchema, z.array(issuedQuoteRecordSchema)),
  orders: z.array(orderRecordSchema),
})
export type DbState = z.infer<typeof dbStateSchema>
