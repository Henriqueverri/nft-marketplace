import {
  CART_ID_HEADER,
  cartSchema,
  quoteSchema,
  type AddCartItemRequest,
  type ApplyCouponRequest,
  type Cart,
  type Quote,
} from '@/contracts/cart'
import { ApiError } from '@/shared/api/errors'
import { http, parseResponse } from '@/shared/api/http'

/**
 * Whose cart a request addresses. The account cart is identified by the session
 * token (added by the HTTP layer); a visitor cart by its X-Cart-Id.
 */
export type CartOwner = { kind: 'user' } | { kind: 'guest'; cartId: string }

function headersFor(owner: CartOwner): Record<string, string> {
  return owner.kind === 'guest' ? { [CART_ID_HEADER]: owner.cartId } : {}
}

/**
 * A visitor write keeps running if the visitor signs in meanwhile (its answer is
 * still discarded): the merge waits for it, so the server never merges first and
 * then receives the write.
 */
function writeConfig(owner: CartOwner) {
  return { headers: headersFor(owner), keepOnSessionChange: owner.kind === 'guest' }
}

const toCart = (data: unknown): Cart => parseResponse(cartSchema, data)

export async function fetchCart(owner: CartOwner, signal?: AbortSignal): Promise<Cart> {
  return toCart((await http.get('/cart', { headers: headersFor(owner), signal })).data)
}

/** Moves the visitor cart into the account of the current session (idempotent). */
export async function mergeGuestCart(cartId: string, signal?: AbortSignal): Promise<Cart> {
  return toCart((await http.post('/cart/merge', null, { headers: { [CART_ID_HEADER]: cartId }, signal })).data)
}

export async function addCartItem(owner: CartOwner, body: AddCartItemRequest): Promise<Cart> {
  return toCart((await http.post('/cart/items', body, writeConfig(owner))).data)
}

export async function updateCartItem(owner: CartOwner, itemId: string, quantity: number): Promise<Cart> {
  const path = `/cart/items/${encodeURIComponent(itemId)}`
  return toCart((await http.patch(path, { quantity }, writeConfig(owner))).data)
}

export async function removeCartItem(owner: CartOwner, itemId: string): Promise<Cart> {
  const path = `/cart/items/${encodeURIComponent(itemId)}`
  return toCart((await http.delete(path, writeConfig(owner))).data)
}

export async function applyCoupon(owner: CartOwner, body: ApplyCouponRequest): Promise<Cart> {
  return toCart((await http.put('/cart/coupon', body, writeConfig(owner))).data)
}

export async function removeCoupon(owner: CartOwner): Promise<Cart> {
  return toCart((await http.delete('/cart/coupon', writeConfig(owner))).data)
}

export async function dismissCartNotices(owner: CartOwner): Promise<Cart> {
  return toCart((await http.delete('/cart/notices', writeConfig(owner))).data)
}

/** Quote of exactly `cartRevision`; any other revision in the answer is a contract error. */
export async function createQuote(owner: CartOwner, cartRevision: number, signal?: AbortSignal): Promise<Quote> {
  const response = await http.post('/quotes', { cartRevision }, { headers: headersFor(owner), signal })
  const quote = parseResponse(quoteSchema, response.data)
  if (quote.cartRevision !== cartRevision) throw new ApiError('UNEXPECTED_RESPONSE')
  return quote
}
