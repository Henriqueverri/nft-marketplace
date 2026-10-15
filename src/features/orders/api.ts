import {
  IDEMPOTENCY_KEY_HEADER,
  orderListSchema,
  orderSchema,
  quoteStaleDetailsSchema,
  type CreateOrderRequest,
  type Order,
  type OrderListQuery,
  type QuoteStaleDetails,
} from '@/contracts/orders'
import type { ApiError } from '@/shared/api/errors'
import { http, parseResponse } from '@/shared/api/http'

/**
 * Creates the order of one purchase attempt. Retrying the same attempt (timeout,
 * network error) must reuse the same `idempotencyKey` and body: the server answers
 * with the order it already created instead of creating another.
 */
export async function createOrder(idempotencyKey: string, body: CreateOrderRequest): Promise<Order> {
  const response = await http.post('/orders', body, { headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } })
  return parseResponse(orderSchema, response.data)
}

export async function fetchOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  return parseResponse(orderSchema, (await http.get(`/orders/${encodeURIComponent(orderId)}`, { signal })).data)
}

/** The user's own orders matching `query`, newest first. Read-only: never creates an order. */
export async function fetchOrders(query: OrderListQuery, signal?: AbortSignal): Promise<Order[]> {
  const response = await http.get('/orders', { params: query, signal })
  return parseResponse(orderListSchema, response.data).orders
}

/** What changed, from a 409 QUOTE_STALE; null for any other error or a malformed body. */
export function quoteStaleDetails(error: ApiError): QuoteStaleDetails | null {
  if (error.code !== 'QUOTE_STALE') return null
  const parsed = quoteStaleDetailsSchema.safeParse(error.details)
  return parsed.success ? parsed.data : null
}
