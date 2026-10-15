import { expect, type Page } from '@playwright/test'
import type { SeedEdition } from './cart'
import { callMockControl } from './mock-control'

/** Order API and control helpers, called from inside the page (served by the MSW worker). */

export interface ApiResult<T = Record<string, unknown>> {
  status: number
  body: T
}

export interface OrderBody {
  orderId: string
  status: 'pending' | 'confirmed' | 'rejected'
  version: number
  error?: { code: string; fieldErrors?: Record<string, string[]> }
}

export interface ServerOrder {
  orderId: string
  userId: string
  status: 'pending' | 'confirmed' | 'rejected'
  version: number
  idempotencyKey: string
}

/** The app renders once the mock worker answers, so API calls from the page reach it. */
export async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
}

export function callApi<T = OrderBody>(
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

export async function apiToken(page: Page, account: { email: string; password: string }): Promise<string> {
  const result = await callApi<{ token: string }>(page, 'POST', '/api/auth/login', {
    body: { email: account.email, password: account.password },
  })
  expect(result.status).toBe(200)
  return result.body.token
}

/** Adds an edition to the token owner's cart and returns a fresh quote of it. */
export async function quoteWith(page: Page, token: string, entry: SeedEdition, quantity: number) {
  const added = await callApi(page, 'POST', '/api/cart/items', {
    token,
    body: { nftId: entry.nft.id, editionId: entry.editionId, quantity },
  })
  expect(added.status).toBe(200)
  const cart = await callApi<{ revision: number }>(page, 'GET', '/api/cart', { token })
  const quote = await callApi<{ quoteId: string; cartRevision: number }>(page, 'POST', '/api/quotes', {
    token,
    body: { cartRevision: cart.body.revision },
  })
  expect(quote.status).toBe(200)
  return quote.body
}

export function anaOrderBody(quote: { quoteId: string; cartRevision: number }, overrides: Record<string, unknown> = {}) {
  return {
    quoteId: quote.quoteId,
    cartRevision: quote.cartRevision,
    walletId: 'wal_ana1',
    networkId: 'ethereum',
    buyer: { fullName: 'Ana Costa', email: 'ana@kurio.test' },
    ...overrides,
  }
}

export async function serverOrders(page: Page): Promise<ServerOrder[]> {
  return (await callMockControl<{ orders: ServerOrder[] }>(page, '/__mock/orders')).orders
}

export async function serverOrder(page: Page, orderId: string): Promise<ServerOrder | undefined> {
  return (await serverOrders(page)).find((order) => order.orderId === orderId)
}

export function setOrderScenario(
  page: Page,
  scenario: { payment?: 'confirm' | 'reject' | 'hold'; wallet?: 'approve' | 'reject' },
) {
  return callMockControl(page, '/__mock/scenario', 'PUT', { latencyMs: 100, failure: 'none', ...scenario })
}

export function resolveOrder(page: Page, orderId: string, outcome: 'confirmed' | 'rejected') {
  return page.evaluate(
    async ({ orderId, outcome }) => {
      const response = await fetch(`/__mock/orders/${orderId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      return { status: response.status, body: (await response.json()) as { status?: string; version?: number } }
    },
    { orderId, outcome },
  )
}

export function replayOrderEvent(
  page: Page,
  orderId: string,
  kind: 'duplicate' | 'stale',
  delivery: 'owner' | 'broadcast' = 'owner',
) {
  return callMockControl<{ eventId: string; version: number; delivered: number }>(
    page,
    `/__mock/orders/${orderId}/replay`,
    'POST',
    { kind, delivery },
  )
}
