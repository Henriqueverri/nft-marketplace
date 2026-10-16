import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { ANA, BRUNO, isMobile } from './support/auth'
import { GOLDEN_OPEN, serverCarts, setStock, VELVET_OPEN, type SeedEdition } from './support/cart'
import { updateNftPrice } from './support/catalog'
import { callMockControl } from './support/mock-control'

/**
 * Order API (F4A): POST /api/orders and GET /api/orders/:orderId, through the MSW
 * handlers, called from the page with the users' own tokens. The checkout screen
 * comes later; these tests prove the server rules it will rely on.
 */

type Account = typeof ANA

interface ApiResult<T = Record<string, unknown>> {
  status: number
  body: T
}

interface OrderBody {
  orderId: string
  status: 'pending' | 'confirmed' | 'rejected'
  version: number
  quoteId: string
  settledAt: string | null
  rejection: { reason: string; message: string } | null
  receipt: {
    lines: { itemId: string; quantity: number; unitPriceEth: string; lineTotalEth: string; nftName: string; editionName: string }[]
    subtotalEth: string
    discountEth: string
    networkFeeEth: string
    totalEth: string
    coupon: { code: string } | null
    buyer: { fullName: string; email: string }
    wallet: { id: string; address: string }
    network: { id: string }
    transactionHash: string
    explorerUrl: string
  }
  error?: { code: string; message: string; fieldErrors?: Record<string, string[]>; details?: StaleDetails }
}

interface StaleDetails {
  reasons: string[]
  changes: Record<string, unknown>[]
  previousTotalEth: string | null
  quote: { quoteId: string; cartRevision: number; totalEth: string } | null
  orderId: string | null
}

interface QuoteBody {
  quoteId: string
  cartRevision: number
  totalEth: string
}

interface ServerOrder {
  orderId: string
  userId: string
  status: string
  idempotencyKey: string
}

async function openApp(page: Page, testInfo: TestInfo) {
  await page.goto('/')
  // Desktop: Figma header. Mobile frames have no top bar — only the tab bar.
  const nav = isMobile(testInfo) ? 'Atalhos' : 'Principal'
  await expect(page.getByRole('navigation', { name: nav })).toBeVisible()
}

function call<T = OrderBody>(
  page: Page,
  method: string,
  path: string,
  options: { token?: string; idempotencyKey?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ method, path, token, idempotencyKey, body }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
      const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
      return { status: response.status, body: await response.json() }
    },
    { method, path, ...options },
  )
}

async function tokenOf(page: Page, account: Account): Promise<string> {
  const result = await call<{ token: string }>(page, 'POST', '/api/auth/login', {
    body: { email: account.email, password: account.password },
  })
  expect(result.status).toBe(200)
  return result.body.token
}

async function addItem(page: Page, token: string, entry: SeedEdition, quantity: number) {
  const result = await call<{ revision: number }>(page, 'POST', '/api/cart/items', {
    token,
    body: { nftId: entry.nft.id, editionId: entry.editionId, quantity },
  })
  expect(result.status).toBe(200)
  return result.body.revision
}

async function quoteCart(page: Page, token: string): Promise<QuoteBody> {
  const cart = await call<{ revision: number }>(page, 'GET', '/api/cart', { token })
  const quote = await call<QuoteBody>(page, 'POST', '/api/quotes', { token, body: { cartRevision: cart.body.revision } })
  expect(quote.status).toBe(200)
  return quote.body
}

function orderRequest(quote: QuoteBody, overrides: Record<string, unknown> = {}) {
  return {
    quoteId: quote.quoteId,
    cartRevision: quote.cartRevision,
    walletId: 'wal_ana1',
    networkId: 'ethereum',
    buyer: { fullName: 'Ana Costa', email: 'ana@kurio.test' },
    ...overrides,
  }
}

function placeOrder(page: Page, token: string, idempotencyKey: string, body: unknown) {
  return call(page, 'POST', '/api/orders', { token, idempotencyKey, body })
}

async function serverOrders(page: Page): Promise<ServerOrder[]> {
  return (await callMockControl<{ orders: ServerOrder[] }>(page, '/__mock/orders')).orders
}

async function available(page: Page, entry: SeedEdition): Promise<number> {
  const nft = await call<{ editions: { id: string; available: number }[] }>(page, 'GET', `/api/nfts/${entry.nft.id}`)
  return nft.body.editions.find((edition) => edition.id === entry.editionId)!.available
}

function setPayment(page: Page, payment: 'confirm' | 'reject' | 'hold') {
  return callMockControl(page, '/__mock/scenario', 'PUT', { latencyMs: 100, failure: 'none', payment })
}

function resolveOrder(page: Page, orderId: string, outcome: 'confirmed' | 'rejected') {
  return page.evaluate(
    async ({ orderId, outcome }) => {
      const response = await fetch(`/__mock/orders/${orderId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      return { status: response.status, body: await response.json() }
    },
    { orderId, outcome },
  )
}

const KEY_A = 'attempt-0000000000000001'
const KEY_B = 'attempt-0000000000000002'

test.describe('Order API @orders', () => {
  test('the same Idempotency-Key and payload return the same order; another payload is a conflict', async ({ page }, testInfo) => {
    await openApp(page, testInfo)
    await setPayment(page, 'hold')
    const token = await tokenOf(page, ANA)
    await addItem(page, token, VELVET_OPEN, 2)
    const quote = await quoteCart(page, token)

    const missingKey = await call(page, 'POST', '/api/orders', { token, body: orderRequest(quote) })
    expect(missingKey.status).toBe(422)
    expect(missingKey.body.error?.fieldErrors).toHaveProperty('Idempotency-Key')

    const first = await placeOrder(page, token, KEY_A, orderRequest(quote))
    expect(first.status).toBe(201)
    expect(first.body).toMatchObject({ status: 'pending', version: 1, quoteId: quote.quoteId, settledAt: null })
    expect(first.body.receipt.totalEth).toBe(quote.totalEth)

    // A repeated click and a retry after a timeout: three more sends of the same attempt.
    const repeats = await page.evaluate(
      async ({ token, key, body }) =>
        Promise.all(
          [0, 1, 2].map(async () => {
            const response = await fetch('/api/orders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Idempotency-Key': key },
              body: JSON.stringify(body),
            })
            return { status: response.status, orderId: ((await response.json()) as { orderId: string }).orderId }
          }),
        ),
      { token, key: KEY_A, body: orderRequest(quote) },
    )
    expect(repeats).toEqual([0, 1, 2].map(() => ({ status: 200, orderId: first.body.orderId })))

    const conflict = await placeOrder(page, token, KEY_A, orderRequest(quote, { buyer: { fullName: 'Outra Pessoa', email: 'ana@kurio.test' } }))
    expect(conflict.status).toBe(409)
    expect(conflict.body.error?.code).toBe('IDEMPOTENCY_CONFLICT')

    // A new attempt with the quote already used does not buy twice.
    const reused = await placeOrder(page, token, KEY_B, orderRequest(quote))
    expect(reused.status).toBe(409)
    expect(reused.body.error?.code).toBe('QUOTE_STALE')
    expect(reused.body.error?.details).toMatchObject({ reasons: ['quote-used'], orderId: first.body.orderId })

    const orders = await serverOrders(page)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({ orderId: first.body.orderId, userId: 'usr_ana', idempotencyKey: KEY_A, status: 'pending' })
    // Nothing was consumed while the payment is pending.
    expect((await serverCarts(page)).users.usr_ana.items).toEqual([
      expect.objectContaining({ editionId: VELVET_OPEN.editionId, quantity: 2 }),
    ])
  })

  test('a stale quote is refused with what changed, without ordering or consuming anything', async ({ page }, testInfo) => {
    await openApp(page, testInfo)
    const token = await tokenOf(page, ANA)
    await addItem(page, token, VELVET_OPEN, 2)
    await addItem(page, token, GOLDEN_OPEN, 1)
    const quote = await quoteCart(page, token)
    const stockBefore = await available(page, VELVET_OPEN)

    // The price changes after the user confirmed the quote.
    await updateNftPrice(page, VELVET_OPEN.nft.id, '0.15')
    const stale = await placeOrder(page, token, KEY_A, orderRequest(quote))
    expect(stale.status).toBe(409)
    expect(stale.body.error?.code).toBe('QUOTE_STALE')
    const details = stale.body.error!.details!
    expect(details.reasons).toEqual(['cart-changed'])
    expect(details.changes).toEqual([
      {
        kind: 'price-changed',
        itemId: VELVET_OPEN.editionId,
        nftId: VELVET_OPEN.nft.id,
        label: 'Velvet Oracle #240 (edição Aberta)',
        previousUnitPriceEth: '0.1',
        currentUnitPriceEth: '0.15',
      },
    ])
    expect(details.previousTotalEth).toBe(quote.totalEth)
    expect(details.quote!.cartRevision).toBeGreaterThan(quote.cartRevision)
    expect(details.quote!.totalEth).not.toBe(quote.totalEth)

    expect(await serverOrders(page)).toHaveLength(0)
    expect(await available(page, VELVET_OPEN)).toBe(stockBefore)
    const cart = (await serverCarts(page)).users.usr_ana
    expect(cart.items.map((item) => [item.editionId, item.quantity, item.unitPriceEth])).toEqual([
      [VELVET_OPEN.editionId, 2, '0.15'],
      [GOLDEN_OPEN.editionId, 1, '0.99'],
    ])

    // Stock drops below the quantity of the fresh quote: refused again, line by line.
    await setStock(page, VELVET_OPEN.nft.id, { [VELVET_OPEN.editionId]: 1 })
    const again = await placeOrder(page, token, KEY_A, orderRequest(details.quote!, { cartRevision: details.quote!.cartRevision }))
    expect(again.status).toBe(409)
    expect(again.body.error?.details?.changes).toEqual([
      expect.objectContaining({ kind: 'quantity-changed', itemId: VELVET_OPEN.editionId, previousQuantity: 2, currentQuantity: 1 }),
    ])
    expect(await serverOrders(page)).toHaveLength(0)

    // Confirming the new values works.
    const fresh = again.body.error!.details!.quote!
    const created = await placeOrder(page, token, KEY_A, orderRequest(fresh))
    expect(created.status).toBe(201)
    expect(created.body.receipt.lines.map((line) => [line.itemId, line.quantity, line.unitPriceEth])).toEqual([
      [VELVET_OPEN.editionId, 1, '0.15'],
      [GOLDEN_OPEN.editionId, 1, '0.99'],
    ])
    expect(created.body.receipt.totalEth).toBe(fresh.totalEth)
  })

  test('an expired, unknown or mismatched quote is refused', async ({ page }, testInfo) => {
    await openApp(page, testInfo)
    const token = await tokenOf(page, ANA)
    await addItem(page, token, VELVET_OPEN, 1)
    const quote = await quoteCart(page, token)

    const unknown = await placeOrder(page, token, KEY_A, orderRequest({ ...quote, quoteId: 'qt_nao-existe' }))
    expect(unknown.body.error?.details?.reasons).toEqual(['quote-not-found'])
    const wrongRevision = await placeOrder(page, token, KEY_A, orderRequest(quote, { cartRevision: quote.cartRevision - 1 }))
    expect(wrongRevision.body.error?.details?.reasons).toEqual(['cart-changed'])

    const wrongNetwork = await placeOrder(page, token, KEY_A, orderRequest(quote, { networkId: 'polygon' }))
    expect(wrongNetwork.status).toBe(422)
    expect(wrongNetwork.body.error?.fieldErrors).toHaveProperty('networkId')
    const otherWallet = await placeOrder(page, token, KEY_A, orderRequest(quote, { walletId: 'wal_bruno1' }))
    expect(otherWallet.status).toBe(422)
    expect(otherWallet.body.error?.fieldErrors).toHaveProperty('walletId')

    // Quotes back an order for ten minutes.
    await page.clock.setFixedTime(Date.now() + 11 * 60 * 1000)
    const expired = await placeOrder(page, token, KEY_A, orderRequest(quote))
    expect(expired.status).toBe(409)
    expect(expired.body.error?.details?.reasons).toEqual(['quote-expired'])
    expect(await serverOrders(page)).toHaveLength(0)
  })

  test('orders are private: another user gets 403 and cannot use the quote; keys are per user', async ({ page }, testInfo) => {
    await openApp(page, testInfo)
    await setPayment(page, 'hold')
    const ana = await tokenOf(page, ANA)
    const bruno = await tokenOf(page, BRUNO)
    await addItem(page, ana, VELVET_OPEN, 1)
    const anaQuote = await quoteCart(page, ana)
    const anaOrder = await placeOrder(page, ana, KEY_A, orderRequest(anaQuote))
    expect(anaOrder.status).toBe(201)
    const path = `/api/orders/${anaOrder.body.orderId}`

    expect((await call(page, 'GET', path, { token: ana })).body.orderId).toBe(anaOrder.body.orderId)
    const forbidden = await call(page, 'GET', path, { token: bruno })
    expect(forbidden.status).toBe(403)
    expect(forbidden.body).not.toHaveProperty('receipt')
    expect((await call(page, 'GET', path)).status).toBe(401)
    expect((await call(page, 'GET', '/api/orders/ord_000000', { token: ana })).status).toBe(404)

    // Ana's quote is unknown to Bruno, even with his own wallet.
    await addItem(page, bruno, GOLDEN_OPEN, 1)
    const stolen = await placeOrder(page, bruno, KEY_B, orderRequest(anaQuote, { walletId: 'wal_bruno1', buyer: { fullName: 'Bruno Lima', email: 'bruno@kurio.test' } }))
    expect(stolen.status).toBe(409)
    expect(stolen.body.error?.details?.reasons).toContain('quote-not-found')

    // The same key as Ana's is a different attempt for Bruno.
    const brunoQuote = await quoteCart(page, bruno)
    const brunoOrder = await placeOrder(page, bruno, KEY_A, orderRequest(brunoQuote, { walletId: 'wal_bruno1', buyer: { fullName: 'Bruno Lima', email: 'bruno@kurio.test' } }))
    expect(brunoOrder.status).toBe(201)
    expect(brunoOrder.body.orderId).not.toBe(anaOrder.body.orderId)
    expect(brunoOrder.body.receipt.lines.map((line) => line.itemId)).toEqual([GOLDEN_OPEN.editionId])

    const owners = (await serverOrders(page)).map((order) => [order.userId, order.idempotencyKey]).sort()
    expect(owners).toEqual([
      ['usr_ana', KEY_A],
      ['usr_bruno', KEY_A],
    ])
  })

  test('confirmation removes only what was bought; the receipt never follows the catalog; terminal states stay', async ({ page }, testInfo) => {
    await openApp(page, testInfo)
    await setPayment(page, 'hold')
    const token = await tokenOf(page, ANA)
    await addItem(page, token, VELVET_OPEN, 2)
    await addItem(page, token, GOLDEN_OPEN, 1)
    const coupon = await call(page, 'PUT', '/api/cart/coupon', { token, body: { code: 'KURIO10' } })
    expect(coupon.status).toBe(200)
    const quote = await quoteCart(page, token)
    const velvetStock = await available(page, VELVET_OPEN)
    const goldenStock = await available(page, GOLDEN_OPEN)

    const created = await placeOrder(page, token, KEY_A, orderRequest(quote))
    expect(created.status).toBe(201)
    const receipt = created.body.receipt
    expect(receipt).toMatchObject({
      subtotalEth: '1.19',
      discountEth: '0.119',
      networkFeeEth: '0.016',
      totalEth: '1.087',
      coupon: { code: 'KURIO10' },
      buyer: { fullName: 'Ana Costa', email: 'ana@kurio.test' },
      wallet: { id: 'wal_ana1', address: '0x4a1f9c2b7e3d5a6b8c9d0e1f2a3b4c5d6e7f8a9b' },
      network: { id: 'ethereum' },
    })
    expect(receipt.transactionHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(receipt.explorerUrl).toBe(`https://etherscan.io/tx/${receipt.transactionHash}`)

    // While pending, the user keeps shopping: one more Velvet unit.
    await call(page, 'PATCH', `/api/cart/items/${VELVET_OPEN.editionId}`, { token, body: { quantity: 3 } })
    expect((await call(page, 'GET', `/api/orders/${created.body.orderId}`, { token })).body.status).toBe('pending')

    const confirmed = await resolveOrder(page, created.body.orderId, 'confirmed')
    expect(confirmed.status).toBe(200)
    const order = await call(page, 'GET', `/api/orders/${created.body.orderId}`, { token })
    expect(order.body).toMatchObject({ status: 'confirmed', version: 2, rejection: null })
    expect(order.body.settledAt).not.toBeNull()

    // Exactly the bought quantities left the cart; the extra unit and the coupon stay.
    const cart = (await serverCarts(page)).users.usr_ana
    expect(cart.items.map((item) => [item.editionId, item.quantity])).toEqual([[VELVET_OPEN.editionId, 1]])
    expect(cart.couponCode).toBe('KURIO10')
    expect(await available(page, VELVET_OPEN)).toBe(velvetStock - 2)
    expect(await available(page, GOLDEN_OPEN)).toBe(goldenStock - 1)

    // A later catalog change does not touch the receipt.
    await updateNftPrice(page, VELVET_OPEN.nft.id, '0.5')
    const later = await call(page, 'GET', `/api/orders/${created.body.orderId}`, { token })
    expect(later.body.receipt).toEqual(receipt)

    // A terminal order does not go back.
    const regress = await resolveOrder(page, created.body.orderId, 'rejected')
    expect(regress.status).toBe(409)
    expect((await call(page, 'GET', `/api/orders/${created.body.orderId}`, { token })).body).toMatchObject({ status: 'confirmed', version: 2 })
  })

  test('a declined payment or missing stock rejects the order and keeps the cart and the stock', async ({ page }, testInfo) => {
    await openApp(page, testInfo)
    await setPayment(page, 'reject')
    const token = await tokenOf(page, ANA)
    await addItem(page, token, VELVET_OPEN, 2)
    await addItem(page, token, GOLDEN_OPEN, 1)
    const stock = await available(page, VELVET_OPEN)

    const declined = await placeOrder(page, token, KEY_A, orderRequest(await quoteCart(page, token)))
    expect(declined.status).toBe(201)
    expect(declined.body.status).toBe('pending')
    // The scenario settles it on its own a moment later.
    await expect
      .poll(async () => (await call(page, 'GET', `/api/orders/${declined.body.orderId}`, { token })).body.status)
      .toBe('rejected')
    const rejected = await call(page, 'GET', `/api/orders/${declined.body.orderId}`, { token })
    expect(rejected.body.rejection?.reason).toBe('payment-declined')
    expect(rejected.body.version).toBe(2)
    expect((await serverCarts(page)).users.usr_ana.items.map((item) => [item.editionId, item.quantity])).toEqual([
      [VELVET_OPEN.editionId, 2],
      [GOLDEN_OPEN.editionId, 1],
    ])
    expect(await available(page, VELVET_OPEN)).toBe(stock)
    expect((await resolveOrder(page, declined.body.orderId, 'confirmed')).status).toBe(409)

    // Held order; another buyer takes the Golden stock before the payment confirms.
    await setPayment(page, 'hold')
    const held = await placeOrder(page, token, KEY_B, orderRequest(await quoteCart(page, token)))
    expect(held.status).toBe(201)
    await setStock(page, GOLDEN_OPEN.nft.id, { [GOLDEN_OPEN.editionId]: 0 })
    await resolveOrder(page, held.body.orderId, 'confirmed')
    const outOfStock = await call(page, 'GET', `/api/orders/${held.body.orderId}`, { token })
    expect(outOfStock.body).toMatchObject({ status: 'rejected', rejection: { reason: 'out-of-stock' } })
    expect(await available(page, VELVET_OPEN)).toBe(stock)
    expect((await serverOrders(page)).map((order) => order.status)).toEqual(['rejected', 'rejected'])
  })
})
