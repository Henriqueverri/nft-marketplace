import { http, HttpResponse } from 'msw'
import {
  addCartItemRequestSchema,
  applyCouponRequestSchema,
  CART_ID_HEADER,
  cartItemIdSchema,
  ESTIMATED_NETWORK_FEE_ETH,
  guestCartIdSchema,
  MAX_CART_LINES,
  quoteRequestSchema,
  updateCartItemRequestSchema,
  type Cart,
  type CartNotice,
  type CartNoticeKind,
  type Quote,
} from '@/contracts/cart'
import type { Edition, Nft } from '@/contracts/catalog'
import { formatEthDisplay, mulEth, parseEth, percentOfEth, subEth, sumEth } from '@/lib/eth'
import { readDb, transaction } from '../db/database'
import type { CartRecord, CouponRecord, DbState } from '../db/schema'
import { withNetwork } from '../network'
import { apiError, readJson, validationError } from './respond'
import { requireSession } from './session'

/**
 * Server-side cart. The owner is the session user (Authorization header) or, for a
 * visitor, the cart id in X-Cart-Id. Every handler first reconciles the cart with the
 * catalog (stock, limits, prices, coupon validity) inside the same transaction, so a
 * response never shows a line the server would refuse to quote.
 */

type CartOwner = { kind: 'user'; userId: string } | { kind: 'guest'; cartId: string }

const MAX_NOTICES = 10
/** Merged visitor ids kept to refuse late writes; the oldest are forgotten first. */
const MAX_MERGED_GUEST_CARTS = 200

const cartIdError = () =>
  apiError('VALIDATION_FAILED', 'Identificador do carrinho ausente ou inválido.', {
    [CART_ID_HEADER]: ['Identificador do carrinho ausente ou inválido.'],
  })

const itemIdError = () =>
  apiError('VALIDATION_FAILED', 'Identificador do item inválido.', { itemId: ['Identificador do item inválido.'] })

const cartMergedError = () =>
  apiError('CART_MERGED', 'Este carrinho de visitante já foi juntado ao carrinho de uma conta. Entre na conta para ver os itens.')

const cartChangedError = () => apiError('CART_CHANGED', 'O carrinho mudou. Atualize o resumo.')

/**
 * With an Authorization header the request is the account's (an invalid or expired
 * token is a 401, never a silent fallback to a visitor cart); without it, a visitor's.
 */
async function resolveOwner(request: Request) {
  if (request.headers.has('authorization')) {
    const auth = await requireSession(request)
    if (!auth.ok) return auth
    return { ok: true as const, owner: { kind: 'user', userId: auth.user.id } as CartOwner }
  }
  const cartId = guestCartIdSchema.safeParse(request.headers.get(CART_ID_HEADER))
  if (!cartId.success) return { ok: false as const, response: cartIdError() }
  return { ok: true as const, owner: { kind: 'guest', cartId: cartId.data } as CartOwner }
}

function cartOf(db: DbState, owner: CartOwner): CartRecord | undefined {
  return owner.kind === 'user' ? db.cartsByUser[owner.userId] : db.guestCarts[owner.cartId]
}

function emptyCartRecord(now: string): CartRecord {
  return { revision: 0, lines: [], couponCode: null, notices: [], updatedAt: now }
}

function ensureCart(draft: DbState, owner: CartOwner, now: string): CartRecord {
  if (owner.kind === 'user') return (draft.cartsByUser[owner.userId] ??= emptyCartRecord(now))
  return (draft.guestCarts[owner.cartId] ??= emptyCartRecord(now))
}

function deleteCart(draft: DbState, owner: CartOwner): void {
  if (owner.kind === 'user') delete draft.cartsByUser[owner.userId]
  else delete draft.guestCarts[owner.cartId]
}

function markMerged(draft: DbState, cartId: string, now: string): void {
  draft.mergedGuestCarts[cartId] = now
  const ids = Object.keys(draft.mergedGuestCarts)
  if (ids.length <= MAX_MERGED_GUEST_CARTS) return
  ids.sort((a, b) => draft.mergedGuestCarts[a].localeCompare(draft.mergedGuestCarts[b]))
  for (const id of ids.slice(0, ids.length - MAX_MERGED_GUEST_CARTS)) delete draft.mergedGuestCarts[id]
}

function findEdition(db: DbState, nftId: string, editionId: string): { nft: Nft; edition: Edition } | null {
  const nft = db.nfts.find((candidate) => candidate.id === nftId)
  const edition = nft?.editions.find((candidate) => candidate.id === editionId)
  return nft && edition ? { nft, edition } : null
}

function lineLimit(edition: Edition): number {
  return Math.min(edition.maxPerOrder, edition.available)
}

/** Why a line cannot hold more: the stock left or the per-order limit. */
function limitReason(edition: Edition): string {
  const limit = lineLimit(edition)
  return edition.available < edition.maxPerOrder
    ? `só ${limit === 1 ? 'resta 1 disponível' : `restam ${limit} disponíveis`}`
    : `o limite é de ${limit} por pedido`
}

function couponState(db: DbState, code: string, now: number): { coupon: CouponRecord | null; expired: boolean } {
  const coupon = db.coupons.find((candidate) => candidate.code === code) ?? null
  return { coupon, expired: !!coupon && Date.parse(coupon.expiresAt) <= now }
}

function notice(kind: CartNoticeKind, message: string, nftId: string | null, now: string): CartNotice {
  return { id: `ntc_${crypto.randomUUID()}`, kind, message, nftId, createdAt: now }
}

function lineLabel(nft: { name: string }, edition: { name: string }) {
  return `${nft.name} (edição ${edition.name})`
}

/**
 * Brings a cart in line with the catalog: sold-out lines leave, quantities above the
 * current limit are reduced, prices follow the catalog and an expired coupon is
 * dropped. Every change becomes a notice. Returns whether anything changed.
 */
export function reconcileCart(db: DbState, cart: CartRecord, now: string): boolean {
  const notices: CartNotice[] = []
  const kept: CartRecord['lines'] = []
  for (const line of cart.lines) {
    const found = findEdition(db, line.nftId, line.editionId)
    if (!found || found.edition.available === 0) {
      const label = found ? lineLabel(found.nft, found.edition) : 'Um item'
      notices.push(notice('removed', `${label} esgotou e foi removido do carrinho.`, line.nftId, now))
      continue
    }
    const { nft, edition } = found
    if (parseEth(line.unitPriceEth) !== parseEth(edition.priceEth)) {
      notices.push(
        notice(
          'price-changed',
          `O preço de ${lineLabel(nft, edition)} mudou de ${formatEthDisplay(line.unitPriceEth)} ETH para ${formatEthDisplay(edition.priceEth)} ETH.`,
          nft.id,
          now,
        ),
      )
      line.unitPriceEth = edition.priceEth
    }
    const limit = lineLimit(edition)
    if (line.quantity > limit) {
      notices.push(
        notice(
          'quantity-reduced',
          `A quantidade de ${lineLabel(nft, edition)} foi ajustada de ${line.quantity} para ${limit}: ${limitReason(edition)}.`,
          nft.id,
          now,
        ),
      )
      line.quantity = limit
    }
    kept.push(line)
  }
  const removed = kept.length !== cart.lines.length
  cart.lines = kept

  if (cart.couponCode) {
    const { coupon, expired } = couponState(db, cart.couponCode, Date.parse(now))
    if (!coupon || expired) {
      notices.push(notice('coupon-removed', `O cupom ${cart.couponCode} expirou e foi removido.`, null, now))
      cart.couponCode = null
    }
  }

  if (notices.length) cart.notices = [...cart.notices, ...notices].slice(-MAX_NOTICES)
  return notices.length > 0 || removed
}

function toCart(db: DbState, owner: CartOwner, record: CartRecord): Cart {
  const items = record.lines.map((line) => {
    const { nft, edition } = findEdition(db, line.nftId, line.editionId)!
    return {
      id: edition.id,
      nft: { id: nft.id, name: nft.name, tokenId: nft.tokenId, imageKey: nft.imageKey, version: nft.version },
      edition: { id: edition.id, name: edition.name },
      quantity: line.quantity,
      unitPriceEth: line.unitPriceEth,
      maxQuantity: lineLimit(edition),
    }
  })
  const coupon = record.couponCode ? db.coupons.find((candidate) => candidate.code === record.couponCode) : null
  return {
    owner: owner.kind,
    revision: record.revision,
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    coupon: coupon ? { code: coupon.code, percentOff: coupon.percentOff } : null,
    notices: record.notices,
  }
}

type Operation = (
  cart: CartRecord,
  draft: DbState,
  now: string,
) => { error: ReturnType<typeof apiError> } | { changed: boolean }

/**
 * Runs `operation` on the owner's cart inside one transaction, after reconciling it.
 * The revision grows once if the reconciliation or the operation changed the cart.
 * A failed operation still keeps the reconciliation (it reflects the catalog), and a
 * visitor cart that would stay empty is never persisted. A visitor cart that was
 * already merged is never written again: a request sent before the sign-in and
 * handled after the merge would otherwise recreate it, orphaned.
 */
async function mutateCart(owner: CartOwner, operation: Operation) {
  const now = new Date().toISOString()
  const outcome = await transaction((draft) => {
    if (owner.kind === 'guest' && owner.cartId in draft.mergedGuestCarts) return { error: cartMergedError(), cart: null }
    const isNew = !cartOf(draft, owner)
    const cart = ensureCart(draft, owner, now)
    const reconciled = reconcileCart(draft, cart, now)
    const result = operation(cart, draft, now)
    const changed = 'changed' in result && result.changed
    if (reconciled || changed) {
      cart.revision += 1
      cart.updatedAt = now
    }
    if (isNew && cart.lines.length === 0 && cart.notices.length === 0 && !cart.couponCode) deleteCart(draft, owner)
    return { error: 'error' in result ? result.error : null, cart: toCart(draft, owner, cart) }
  })
  return outcome.error ?? HttpResponse.json<Cart>(outcome.cart!)
}

function limitError(nft: Nft, edition: Edition, inCart: number) {
  const limit = lineLimit(edition)
  const message =
    inCart > 0
      ? `Você já tem ${inCart} de ${lineLabel(nft, edition)} no carrinho e ${limitReason(edition)}.`
      : `Não é possível adicionar essa quantidade de ${lineLabel(nft, edition)}: ${limitReason(edition)}.`
  return apiError('QUANTITY_LIMIT_EXCEEDED', message, { quantity: [`Máximo de ${limit} para esta edição.`] })
}

/* ---------- Quotes ---------- */

/** Quotes as they were sent, so tests can compare the screen with the real response. */
const recordedQuotes = new Map<string, Quote>()

export function getRecordedQuote(quoteId: string): Quote | undefined {
  return recordedQuotes.get(quoteId)
}

export function clearRecordedQuotes(): void {
  recordedQuotes.clear()
}

function buildQuote(db: DbState, cart: CartRecord | undefined, now: string): Quote {
  const lines = (cart?.lines ?? []).map((line) => ({
    itemId: line.editionId,
    nftId: line.nftId,
    quantity: line.quantity,
    unitPriceEth: line.unitPriceEth,
    lineTotalEth: mulEth(line.unitPriceEth, line.quantity),
  }))
  const subtotalEth = sumEth(lines.map((line) => line.lineTotalEth))
  const coupon = cart?.couponCode ? db.coupons.find((candidate) => candidate.code === cart.couponCode) : undefined
  const discountEth = coupon ? percentOfEth(subtotalEth, coupon.percentOff) : '0'
  const networkFeeEth = lines.length ? ESTIMATED_NETWORK_FEE_ETH : '0'
  const nftVersions: Record<string, number> = {}
  for (const line of lines) nftVersions[line.nftId] = db.nfts.find((nft) => nft.id === line.nftId)!.version
  const quote: Quote = {
    quoteId: `qt_${crypto.randomUUID()}`,
    cartRevision: cart?.revision ?? 0,
    lines,
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalEth,
    discountEth,
    networkFeeEth,
    totalEth: sumEth([subEth(subtotalEth, discountEth), networkFeeEth]),
    coupon: coupon ? { code: coupon.code, percentOff: coupon.percentOff } : null,
    nftVersions,
    createdAt: now,
  }
  recordedQuotes.set(quote.quoteId, quote)
  if (recordedQuotes.size > 50) recordedQuotes.delete(recordedQuotes.keys().next().value!)
  return quote
}

/* ---------- Handlers ---------- */

export const cartHandlers = [
  http.get(
    '/api/cart',
    withNetwork(async ({ request }) => {
      const resolved = await resolveOwner(request)
      if (!resolved.ok) return resolved.response
      const { owner } = resolved
      const db = await readDb()
      const existing = cartOf(db, owner)
      if (!existing) return HttpResponse.json(toCart(db, owner, emptyCartRecord(new Date().toISOString())))
      // Reconciling a copy first keeps plain reads from writing the database.
      if (!reconcileCart(db, structuredClone(existing), new Date().toISOString())) {
        return HttpResponse.json(toCart(db, owner, existing))
      }
      return mutateCart(owner, () => ({ changed: false }))
    }),
  ),

  http.post(
    '/api/cart/items',
    withNetwork(async ({ request }) => {
      const resolved = await resolveOwner(request)
      if (!resolved.ok) return resolved.response
      const parsed = addCartItemRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)
      const { nftId, editionId, quantity } = parsed.data

      return mutateCart(resolved.owner, (cart, draft, now) => {
        const found = findEdition(draft, nftId, editionId)
        if (!found) return { error: apiError('NOT_FOUND', 'NFT ou edição não encontrados.') }
        const { nft, edition } = found
        if (edition.available === 0) {
          return { error: apiError('OUT_OF_STOCK', `${lineLabel(nft, edition)} está esgotado.`) }
        }
        const line = cart.lines.find((candidate) => candidate.editionId === editionId)
        const inCart = line?.quantity ?? 0
        if (inCart + quantity > lineLimit(edition)) return { error: limitError(nft, edition, inCart) }
        if (!line && cart.lines.length >= MAX_CART_LINES) {
          return {
            error: apiError('VALIDATION_FAILED', `O carrinho aceita até ${MAX_CART_LINES} itens diferentes.`),
          }
        }
        if (line) line.quantity += quantity
        else cart.lines.push({ nftId, editionId, quantity, unitPriceEth: edition.priceEth, addedAt: now })
        return { changed: true }
      })
    }),
  ),

  http.patch(
    '/api/cart/items/:itemId',
    withNetwork(async ({ request, params }) => {
      const resolved = await resolveOwner(request)
      if (!resolved.ok) return resolved.response
      const itemId = cartItemIdSchema.safeParse(params.itemId)
      if (!itemId.success) return itemIdError()
      const parsed = updateCartItemRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)
      const { quantity } = parsed.data

      return mutateCart(resolved.owner, (cart, draft) => {
        const line = cart.lines.find((candidate) => candidate.editionId === itemId.data)
        if (!line) return { error: apiError('NOT_FOUND', 'Este item não está no carrinho.') }
        const { nft, edition } = findEdition(draft, line.nftId, line.editionId)!
        if (quantity > lineLimit(edition)) return { error: limitError(nft, edition, 0) }
        const changed = line.quantity !== quantity
        line.quantity = quantity
        return { changed }
      })
    }),
  ),

  /** Idempotent: removing a line that is no longer there answers with the cart. */
  http.delete(
    '/api/cart/items/:itemId',
    withNetwork(async ({ request, params }) => {
      const resolved = await resolveOwner(request)
      if (!resolved.ok) return resolved.response
      const itemId = cartItemIdSchema.safeParse(params.itemId)
      if (!itemId.success) return itemIdError()
      return mutateCart(resolved.owner, (cart) => {
        const before = cart.lines.length
        cart.lines = cart.lines.filter((line) => line.editionId !== itemId.data)
        return { changed: cart.lines.length !== before }
      })
    }),
  ),

  http.put(
    '/api/cart/coupon',
    withNetwork(async ({ request }) => {
      const resolved = await resolveOwner(request)
      if (!resolved.ok) return resolved.response
      const parsed = applyCouponRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)
      const { code } = parsed.data

      return mutateCart(resolved.owner, (cart, draft, now) => {
        if (cart.lines.length === 0) {
          return { error: apiError('CONFLICT', 'Adicione itens ao carrinho antes de aplicar um cupom.') }
        }
        const { coupon, expired } = couponState(draft, code, Date.parse(now))
        if (!coupon) {
          return { error: apiError('COUPON_INVALID', `O cupom ${code} não existe.`, { code: ['Cupom inválido.'] }) }
        }
        if (expired) {
          return { error: apiError('COUPON_EXPIRED', `O cupom ${code} expirou.`, { code: ['Cupom expirado.'] }) }
        }
        const changed = cart.couponCode !== coupon.code
        cart.couponCode = coupon.code
        return { changed }
      })
    }),
  ),

  http.delete(
    '/api/cart/coupon',
    withNetwork(async ({ request }) => {
      const resolved = await resolveOwner(request)
      if (!resolved.ok) return resolved.response
      return mutateCart(resolved.owner, (cart) => {
        const changed = cart.couponCode !== null
        cart.couponCode = null
        return { changed }
      })
    }),
  ),

  /** Reading the notices changes nothing that is quoted, so the revision stays. */
  http.delete(
    '/api/cart/notices',
    withNetwork(async ({ request }) => {
      const resolved = await resolveOwner(request)
      if (!resolved.ok) return resolved.response
      return mutateCart(resolved.owner, (cart) => {
        cart.notices = []
        return { changed: false }
      })
    }),
  ),

  /**
   * Visitor cart → account cart, in one transaction. Both carts are reconciled first;
   * the same edition becomes one line with the quantities added up and capped at the
   * current limit; the account keeps its coupon, or takes the visitor's if it has none
   * and it is still valid. The visitor cart is deleted and its id recorded as merged
   * (even if it had no cart yet), so repeating the call (retry, second tab) merges
   * nothing twice and a visitor write that arrives later is refused. The revision
   * grows only if a line or the coupon of the account changed.
   */
  http.post(
    '/api/cart/merge',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const cartId = guestCartIdSchema.safeParse(request.headers.get(CART_ID_HEADER))
      if (!cartId.success) return cartIdError()
      const owner: CartOwner = { kind: 'user', userId: auth.user.id }

      return mutateCart(owner, (cart, draft, now) => {
        const guest = draft.guestCarts[cartId.data]
        markMerged(draft, cartId.data, now)
        if (!guest) return { changed: false }
        delete draft.guestCarts[cartId.data]
        reconcileCart(draft, guest, now)
        const notices = [...guest.notices]
        let merged = 0
        let changed = false

        for (const guestLine of guest.lines) {
          const { nft, edition } = findEdition(draft, guestLine.nftId, guestLine.editionId)!
          const line = cart.lines.find((candidate) => candidate.editionId === guestLine.editionId)
          const wanted = (line?.quantity ?? 0) + guestLine.quantity
          const quantity = Math.min(wanted, lineLimit(edition))
          if (line) {
            changed ||= line.quantity !== quantity
            line.quantity = quantity
          } else if (cart.lines.length < MAX_CART_LINES) {
            cart.lines.push({ ...guestLine, quantity })
            changed = true
          } else {
            notices.push(
              notice('removed', `${lineLabel(nft, edition)} não coube no carrinho (até ${MAX_CART_LINES} itens diferentes).`, nft.id, now),
            )
            continue
          }
          merged += 1
          if (quantity < wanted) {
            notices.push(
              notice(
                'quantity-reduced',
                `A quantidade de ${lineLabel(nft, edition)} foi ajustada de ${wanted} para ${quantity} ao juntar os carrinhos: ${limitReason(edition)}.`,
                nft.id,
                now,
              ),
            )
          }
        }

        if (!cart.couponCode && guest.couponCode) {
          cart.couponCode = guest.couponCode
          changed = true
        }
        if (merged > 0) {
          const count = merged
          notices.unshift(
            notice(
              'merged',
              `${count === 1 ? 'O item' : `Os ${count} itens`} do seu carrinho de visitante ${count === 1 ? 'foi adicionado' : 'foram adicionados'} ao carrinho da sua conta.`,
              null,
              now,
            ),
          )
        }
        cart.notices = [...cart.notices, ...notices].slice(-MAX_NOTICES)
        return { changed }
      })
    }),
  ),

  /**
   * The financial summary of the revision the client is showing. The cart is
   * reconciled first; if that (or anything else) moved it past the requested
   * revision, or the cart no longer exists (merged into an account, emptied by a
   * reset), the answer is 409 CART_CHANGED, never a quote for other items.
   *
   * Each decision is taken on one state of the database, with no await between the
   * check and its use: the snapshot when nothing needs reconciling (a plain read
   * writes nothing), or the transaction's own draft when it does.
   */
  http.post(
    '/api/quotes',
    withNetwork(async ({ request }) => {
      const resolved = await resolveOwner(request)
      if (!resolved.ok) return resolved.response
      const parsed = quoteRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)
      const { owner } = resolved
      const { cartRevision } = parsed.data
      const now = new Date().toISOString()

      const db = await readDb()
      const snapshot = cartOf(db, owner)
      if (!snapshot) return cartRevision === 0 ? HttpResponse.json(buildQuote(db, undefined, now)) : cartChangedError()
      if (!reconcileCart(db, structuredClone(snapshot), now)) {
        return snapshot.revision === cartRevision ? HttpResponse.json(buildQuote(db, snapshot, now)) : cartChangedError()
      }

      const quote = await transaction((draft) => {
        const cart = cartOf(draft, owner)
        if (!cart) return null
        if (reconcileCart(draft, cart, now)) {
          cart.revision += 1
          cart.updatedAt = now
        }
        return cart.revision === cartRevision ? buildQuote(draft, cart, now) : null
      })
      return quote ? HttpResponse.json(quote) : cartChangedError()
    }),
  ),
]

/** Server-side view of every cart, for the control API (no prices beyond the lines). */
export function summarizeCarts(db: DbState) {
  const summarize = (cart: CartRecord) => ({
    revision: cart.revision,
    couponCode: cart.couponCode,
    items: cart.lines.map((line) => ({ editionId: line.editionId, quantity: line.quantity, unitPriceEth: line.unitPriceEth })),
    notices: cart.notices.map((entry) => entry.kind),
  })
  return {
    users: Object.fromEntries(Object.entries(db.cartsByUser).map(([userId, cart]) => [userId, summarize(cart)])),
    guests: Object.fromEntries(Object.entries(db.guestCarts).map(([cartId, cart]) => [cartId, summarize(cart)])),
    mergedGuests: Object.keys(db.mergedGuestCarts),
  }
}
