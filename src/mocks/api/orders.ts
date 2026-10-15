import { http, HttpResponse } from 'msw'
import type { Quote } from '@/contracts/cart'
import type { Nft } from '@/contracts/catalog'
import {
  createOrderRequestSchema,
  IDEMPOTENCY_KEY_HEADER,
  idempotencyKeySchema,
  ORDER_LIST_LIMIT,
  orderIdSchema,
  orderListQuerySchema,
  type CreateOrderRequest,
  type Order,
  type OrderList,
  type OrderRejectionReason,
  type QuoteChange,
  type QuoteStaleDetails,
  type QuoteStaleReason,
} from '@/contracts/orders'
import { parseEth } from '@/lib/eth'
import { readDb, transaction } from '../db/database'
import type { DbState, OrderRecord } from '../db/schema'
import { withNetwork } from '../network'
import { getScenario } from '../scenarios'
import type { OrderUpdatedEvent } from '@/contracts/events'
import { createEnvelope, emitToAll, emitToUser } from '../socket'
import { buildQuote, findEdition, issueQuote, lineLabel, priceCart, reconcileCart } from './cart'
import { nftUpdatedEvent } from './catalog'
import { apiError, readJson, validationError } from './respond'
import { requireSession } from './session'

/**
 * Orders. Creation is idempotent per user and Idempotency-Key, revalidates the quote
 * against the cart and the catalog in the same transaction that creates the order,
 * and freezes the receipt. The simulated payment settles the order once: confirmed
 * (stock is consumed and the bought quantities leave the cart) or rejected (nothing
 * changes). Every state change emits `order.updated` to the owner.
 *
 * Settlement time is persisted (`settlesAt`). A timer per pending order settles it
 * when due, with no read needed; the timers are armed again when the mock starts (a
 * refresh of the page that hosts it) and dropped on reset. Any read of a due order
 * also settles it, so a lost timer (closed tab) never leaves an order stuck.
 */

/** Time the simulated payment takes with the `confirm` and `reject` scenarios. */
export const PAYMENT_SETTLE_MS = 1500

/** A state change made by a transaction, published (events, timers) after it commits. */
interface Transition {
  userId: string
  order: Order
  stock: Nft[]
}

const settlementTimers = new Map<string, ReturnType<typeof setTimeout>>()
/** Last two `order.updated` per order, kept to replay a duplicate or a stale event in tests. */
const eventHistory = new Map<string, OrderUpdatedEvent[]>()

export function clearOrderTimers(): void {
  for (const timer of settlementTimers.values()) clearTimeout(timer)
  settlementTimers.clear()
  eventHistory.clear()
}

const REJECTION_MESSAGES: Record<OrderRejectionReason, string> = {
  'payment-declined': 'O pagamento foi recusado pela carteira. Nenhum valor foi cobrado e os itens continuam no carrinho.',
  'out-of-stock': 'Uma das edições esgotou antes da confirmação. Nenhum valor foi cobrado e os itens continuam no carrinho.',
}

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Same fields in the same order, so equal payloads give equal strings. */
function fingerprint(request: CreateOrderRequest): string {
  return JSON.stringify([
    request.quoteId,
    request.cartRevision,
    request.walletId,
    request.networkId,
    request.buyer.fullName,
    request.buyer.email,
  ])
}

/** Line-by-line difference between the quote the user confirmed and the cart now. */
function quoteChanges(db: DbState, previous: Quote, current: Omit<Quote, 'quoteId' | 'createdAt'>): QuoteChange[] {
  const label = (nftId: string, itemId: string) => {
    const found = findEdition(db, nftId, itemId)
    return found ? lineLabel(found.nft, found.edition) : itemId
  }
  const changes: QuoteChange[] = []
  for (const before of previous.lines) {
    const after = current.lines.find((line) => line.itemId === before.itemId)
    const base = { itemId: before.itemId, nftId: before.nftId, label: label(before.nftId, before.itemId) }
    if (!after) {
      changes.push({ kind: 'item-removed', ...base, previousQuantity: before.quantity })
      continue
    }
    if (parseEth(after.unitPriceEth) !== parseEth(before.unitPriceEth)) {
      changes.push({
        kind: 'price-changed',
        ...base,
        previousUnitPriceEth: before.unitPriceEth,
        currentUnitPriceEth: after.unitPriceEth,
      })
    }
    if (after.quantity !== before.quantity) {
      changes.push({ kind: 'quantity-changed', ...base, previousQuantity: before.quantity, currentQuantity: after.quantity })
    }
  }
  for (const after of current.lines) {
    if (previous.lines.some((line) => line.itemId === after.itemId)) continue
    changes.push({
      kind: 'item-added',
      itemId: after.itemId,
      nftId: after.nftId,
      label: label(after.nftId, after.itemId),
      currentQuantity: after.quantity,
    })
  }
  if ((previous.coupon?.code ?? null) !== (current.coupon?.code ?? null)) {
    changes.push({ kind: 'coupon-changed', previousCode: previous.coupon?.code ?? null, currentCode: current.coupon?.code ?? null })
  }
  return changes
}

/**
 * pending → confirmed | rejected, once. A settled order never changes again, so a
 * late or repeated settlement is a no-op. Confirming re-checks the stock: if an
 * edition no longer has the quantity, the order is rejected instead. Returns the
 * transition (with the NFTs whose stock changed) or null if nothing changed.
 */
function settle(draft: DbState, record: OrderRecord, outcome: 'confirmed' | 'rejected', now: string): Transition | null {
  const { order } = record
  if (order.status !== 'pending') return null
  let reason: OrderRejectionReason | null = outcome === 'rejected' ? 'payment-declined' : null
  const changed = new Map<string, Nft>()

  if (!reason) {
    const editions = order.receipt.lines.map((line) => ({ line, found: findEdition(draft, line.nftId, line.itemId) }))
    if (editions.some(({ line, found }) => !found || found.edition.available < line.quantity)) reason = 'out-of-stock'
    else {
      for (const { line, found } of editions) {
        found!.edition.available -= line.quantity
        changed.set(found!.nft.id, found!.nft)
      }
      for (const nft of changed.values()) nft.version += 1
      removeBoughtItems(draft, record, now)
    }
  }

  order.status = reason ? 'rejected' : 'confirmed'
  order.rejection = reason ? { reason, message: REJECTION_MESSAGES[reason] } : null
  order.settledAt = now
  order.version += 1
  return { userId: record.userId, order, stock: [...changed.values()] }
}

/**
 * Takes out of the buyer's cart exactly what was bought: the quantity of each bought
 * edition, never more, and no other line. The cart may have changed since the order
 * was created (more units, other items); those stay.
 */
function removeBoughtItems(draft: DbState, record: OrderRecord, now: string): void {
  const cart = draft.cartsByUser[record.userId]
  if (!cart) return
  let changed = false
  for (const bought of record.order.receipt.lines) {
    const line = cart.lines.find((candidate) => candidate.editionId === bought.itemId)
    if (!line) continue
    line.quantity -= bought.quantity
    changed = true
  }
  if (!changed) return
  cart.lines = cart.lines.filter((line) => line.quantity > 0)
  if (cart.lines.length === 0) cart.couponCode = null
  cart.revision += 1
  cart.updatedAt = now
}

function isDue(record: OrderRecord, now: string): boolean {
  return (
    record.order.status === 'pending' &&
    !!record.plannedOutcome &&
    !!record.settlesAt &&
    Date.parse(record.settlesAt) <= Date.parse(now)
  )
}

function settleIfDue(draft: DbState, record: OrderRecord, now: string): Transition | null {
  return isDue(record, now) ? settle(draft, record, record.plannedOutcome!, now) : null
}

function orderUpdatedEvent(userId: string, order: Order): OrderUpdatedEvent {
  return {
    ...createEnvelope('order.updated', { kind: 'order', id: order.orderId }, order.version, {
      orderId: order.orderId,
      status: order.status,
    }),
    userId,
  }
}

/** After the commit: stock events, the owner's `order.updated`, and no timer left for a settled order. */
function publish(transitions: (Transition | null)[]): void {
  for (const transition of transitions) {
    if (!transition) continue
    const { userId, order, stock } = transition
    for (const nft of stock) emitToAll('nft.updated', nftUpdatedEvent(nft))
    if (order.status !== 'pending') {
      clearTimeout(settlementTimers.get(order.orderId))
      settlementTimers.delete(order.orderId)
    }
    const event = orderUpdatedEvent(userId, order)
    eventHistory.set(order.orderId, [...(eventHistory.get(order.orderId) ?? []), event].slice(-2))
    void emitToUser(userId, 'order.updated', event)
  }
}

function scheduleSettlement(orderId: string, settlesAt: string): void {
  clearTimeout(settlementTimers.get(orderId))
  const delay = Math.max(0, Date.parse(settlesAt) - Date.now())
  settlementTimers.set(
    orderId,
    setTimeout(() => {
      settlementTimers.delete(orderId)
      void settleWhenDue(orderId)
    }, delay),
  )
}

async function settleWhenDue(orderId: string): Promise<void> {
  try {
    const db = await readDb()
    const record = db.orders.find((candidate) => candidate.order.orderId === orderId)
    if (!record || record.order.status !== 'pending' || !record.plannedOutcome || !record.settlesAt) return
    const now = new Date().toISOString()
    if (!isDue(record, now)) return scheduleSettlement(orderId, record.settlesAt)
    const transition = await transaction((draft) => {
      const current = draft.orders.find((candidate) => candidate.order.orderId === orderId)
      return current ? settleIfDue(draft, current, now) : null
    })
    publish([transition])
  } catch {
    // Storage unavailable or corrupted: the next read of the order settles it.
  }
}

/** Arms a timer for every pending order with a planned outcome (mock start). */
export async function armOrderSettlements(): Promise<void> {
  try {
    const db = await readDb()
    for (const record of db.orders) {
      if (record.order.status === 'pending' && record.plannedOutcome && record.settlesAt) {
        scheduleSettlement(record.order.orderId, record.settlesAt)
      }
    }
  } catch {
    // A corrupted database is reported by the API; there is nothing to arm.
  }
}

const idempotencyKeyError = () =>
  apiError('VALIDATION_FAILED', 'Envie uma chave de idempotência válida.', {
    [IDEMPOTENCY_KEY_HEADER]: ['Chave de idempotência ausente ou inválida.'],
  })

const notFound = () => apiError('NOT_FOUND', 'Pedido não encontrado.')

type CreateOutcome =
  | { kind: 'created'; order: Order; settlesAt: string | null }
  | { kind: 'replayed'; order: Order; transition: Transition | null }
  | { kind: 'error'; response: ReturnType<typeof apiError> }

export const orderHandlers = [
  http.post(
    '/api/orders',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const key = idempotencyKeySchema.safeParse(request.headers.get(IDEMPOTENCY_KEY_HEADER))
      if (!key.success) return idempotencyKeyError()
      const parsed = createOrderRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)
      const body = parsed.data
      const userId = auth.user.id
      const requestFingerprint = fingerprint(body)
      const payment = getScenario().payment
      const now = new Date().toISOString()

      const outcome = await transaction((draft): CreateOutcome => {
        // The same attempt again (double click, retry after a timeout) gets the same order.
        const existing = draft.orders.find((record) => record.userId === userId && record.idempotencyKey === key.data)
        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint) {
            return {
              kind: 'error',
              response: apiError(
                'IDEMPOTENCY_CONFLICT',
                'Esta chave de idempotência já foi usada com outro pedido. Gere uma nova tentativa de compra.',
              ),
            }
          }
          return { kind: 'replayed', order: existing.order, transition: settleIfDue(draft, existing, now) }
        }

        const wallet = draft.walletsByUser[userId]?.find((candidate) => candidate.id === body.walletId)
        if (!wallet) {
          return {
            kind: 'error',
            response: apiError('VALIDATION_FAILED', 'Escolha uma das suas carteiras.', { walletId: ['Carteira não encontrada.'] }),
          }
        }
        const network = draft.networks.find((candidate) => candidate.id === body.networkId)!
        if (wallet.networkId !== network.id) {
          return {
            kind: 'error',
            response: apiError('VALIDATION_FAILED', `A carteira ${wallet.nickname} não opera na rede ${network.name}.`, {
              networkId: [`Escolha a rede da carteira selecionada.`],
            }),
          }
        }

        // The cart as the server sees it now, after following the catalog.
        const cart = draft.cartsByUser[userId]
        if (cart && reconcileCart(draft, cart, now)) {
          cart.revision += 1
          cart.updatedAt = now
        }
        const current = priceCart(draft, cart)
        const issued = draft.issuedQuotes[userId]?.find((entry) => entry.quote.quoteId === body.quoteId)

        const reasons: QuoteStaleReason[] = []
        if (!issued) reasons.push('quote-not-found')
        else {
          if (issued.orderId) reasons.push('quote-used')
          if (Date.parse(issued.expiresAt) <= Date.parse(now)) reasons.push('quote-expired')
        }
        const quotedRevision = issued?.quote.cartRevision ?? body.cartRevision
        if (body.cartRevision !== quotedRevision || current.cartRevision !== quotedRevision) reasons.push('cart-changed')
        const changes = issued ? quoteChanges(draft, issued.quote, current) : []
        if (changes.length > 0 && !reasons.includes('cart-changed')) reasons.push('cart-changed')

        if (reasons.length > 0) {
          let fresh: Quote | null = null
          if (cart && current.lines.length > 0) {
            fresh = buildQuote(draft, cart, now)
            issueQuote(draft, { kind: 'user', userId }, fresh)
          }
          const details: QuoteStaleDetails = {
            reasons,
            changes,
            previousTotalEth: issued?.quote.totalEth ?? null,
            quote: fresh,
            orderId: issued?.orderId ?? null,
          }
          return {
            kind: 'error',
            response: apiError(
              'QUOTE_STALE',
              'Os valores do pedido mudaram desde a sua confirmação. Confira o novo resumo e confirme de novo.',
              undefined,
              details,
            ),
          }
        }
        if (current.lines.length === 0) {
          return { kind: 'error', response: apiError('CONFLICT', 'Seu carrinho está vazio.') }
        }

        const orderId = `ord_${randomHex(8)}`
        const transactionHash = `0x${randomHex(32)}`
        const order: Order = {
          orderId,
          status: 'pending',
          version: 1,
          quoteId: issued!.quote.quoteId,
          createdAt: now,
          settledAt: null,
          rejection: null,
          receipt: {
            lines: current.lines.map((line) => {
              const { nft, edition } = findEdition(draft, line.nftId, line.itemId)!
              return {
                itemId: line.itemId,
                nftId: nft.id,
                nftName: nft.name,
                tokenId: nft.tokenId,
                imageKey: nft.imageKey,
                editionName: edition.name,
                quantity: line.quantity,
                unitPriceEth: line.unitPriceEth,
                lineTotalEth: line.lineTotalEth,
              }
            }),
            itemCount: current.itemCount,
            subtotalEth: current.subtotalEth,
            discountEth: current.discountEth,
            networkFeeEth: current.networkFeeEth,
            totalEth: current.totalEth,
            coupon: current.coupon,
            buyer: body.buyer,
            wallet: { id: wallet.id, nickname: wallet.nickname, address: wallet.address, provider: wallet.provider },
            network: { id: network.id, name: network.name, currency: network.currency },
            transactionHash,
            explorerUrl: `${network.explorerUrl}/tx/${transactionHash}`,
          },
        }
        const plannedOutcome = payment === 'confirm' ? 'confirmed' : payment === 'reject' ? 'rejected' : null
        const settlesAt = plannedOutcome ? new Date(Date.parse(now) + PAYMENT_SETTLE_MS).toISOString() : null
        draft.orders.push({ userId, idempotencyKey: key.data, requestFingerprint, plannedOutcome, settlesAt, order })
        issued!.orderId = orderId
        return { kind: 'created', order, settlesAt }
      })

      if (outcome.kind === 'error') return outcome.response
      if (outcome.kind === 'replayed') {
        publish([outcome.transition])
        return HttpResponse.json<Order>(outcome.order, { status: 200 })
      }
      publish([{ userId, order: outcome.order, stock: [] }])
      if (outcome.settlesAt) scheduleSettlement(outcome.order.orderId, outcome.settlesAt)
      return HttpResponse.json<Order>(outcome.order, { status: 201 })
    }),
  ),

  /** The owner's order, settled first if its payment is due. Another user's order is a 403. */
  http.get(
    '/api/orders/:orderId',
    withNetwork(async ({ request, params }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const orderId = orderIdSchema.safeParse(params.orderId)
      if (!orderId.success) return notFound()
      const now = new Date().toISOString()
      const db = await readDb()
      const found = db.orders.find((record) => record.order.orderId === orderId.data)
      if (!found) return notFound()
      if (found.userId !== auth.user.id) return apiError('FORBIDDEN', 'Este pedido pertence a outra conta.')
      if (!isDue(found, now)) return HttpResponse.json<Order>(found.order)

      const { order, transition } = await transaction((draft) => {
        const record = draft.orders.find((candidate) => candidate.order.orderId === orderId.data)!
        return { order: record.order, transition: settleIfDue(draft, record, now) }
      })
      publish([transition])
      return HttpResponse.json<Order>(order)
    }),
  ),

  /** The user's own orders, newest first, due ones settled first. Never creates anything. */
  http.get(
    '/api/orders',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const search = new URL(request.url).searchParams
      const query = orderListQuerySchema.safeParse({
        status: search.get('status') ?? undefined,
        idempotencyKey: search.get('idempotencyKey') ?? undefined,
      })
      if (!query.success) return validationError(query.error)
      const userId = auth.user.id
      const now = new Date().toISOString()
      let db = await readDb()
      if (db.orders.some((record) => record.userId === userId && isDue(record, now))) {
        const transitions = await transaction((draft) =>
          draft.orders.filter((record) => record.userId === userId).map((record) => settleIfDue(draft, record, now)),
        )
        publish(transitions)
        db = await readDb()
      }
      const orders = db.orders
        .filter(
          (record) =>
            record.userId === userId &&
            (!query.data.status || record.order.status === query.data.status) &&
            (!query.data.idempotencyKey || record.idempotencyKey === query.data.idempotencyKey),
        )
        .map((record) => record.order)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, ORDER_LIST_LIMIT)
      return HttpResponse.json<OrderList>({ orders })
    }),
  ),
]

/**
 * Settles a pending order now (control API), whatever the scenario planned. Returns
 * null for an unknown order and `settled: false` if it was already terminal.
 */
export async function resolveOrder(orderId: string, outcome: 'confirmed' | 'rejected') {
  const db = await readDb()
  if (!db.orders.some((record) => record.order.orderId === orderId)) return null
  const result = await transaction((draft) => {
    const record = draft.orders.find((candidate) => candidate.order.orderId === orderId)!
    return { order: record.order, transition: settle(draft, record, outcome, new Date().toISOString()) }
  })
  publish([result.transition])
  return { order: result.order, settled: result.transition !== null }
}

/**
 * `duplicate` re-sends the last `order.updated` as is (same eventId). `stale` sends
 * the previous one under a new eventId, as a delayed message would arrive.
 */
export async function replayOrderEvent(
  orderId: string,
  kind: 'duplicate' | 'stale',
  delivery: 'owner' | 'broadcast',
): Promise<{ ok: true; event: OrderUpdatedEvent; delivered: number } | { ok: false; message: string }> {
  const events = eventHistory.get(orderId) ?? []
  const last = events.at(-1)
  if (!last) return { ok: false, message: 'Nenhum evento emitido para este pedido ainda.' }
  let event = last
  if (kind === 'stale') {
    const previous = events.length > 1 ? events[0] : null
    if (!previous) return { ok: false, message: 'É preciso haver duas mudanças de estado antes de um evento antigo.' }
    event = { ...previous, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() }
  }
  const delivered =
    delivery === 'broadcast' ? emitToAll('order.updated', event) : await emitToUser(event.userId, 'order.updated', event)
  return { ok: true, event, delivered }
}

/** Server-side view of the orders, for the control API (tests count and inspect them). */
export function summarizeOrders(db: DbState) {
  return db.orders.map((record) => ({
    orderId: record.order.orderId,
    userId: record.userId,
    status: record.order.status,
    version: record.order.version,
    idempotencyKey: record.idempotencyKey,
    quoteId: record.order.quoteId,
    totalEth: record.order.receipt.totalEth,
  }))
}
