import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Order } from '@/contracts/orders'
import { RECONCILE_ON_RECONNECT_META, useRealtimeEvent } from '@/shared/realtime/context'
import { privateQueryKey } from '@/shared/session/query-keys'
import { sessionStore } from '@/shared/session/session-store'
import { fetchOrder, fetchOrders } from './api'

export const orderKeys = {
  order: (userId: string, orderId: string) => privateQueryKey(userId, 'order', orderId),
  pending: (userId: string) => privateQueryKey(userId, 'orders', 'pending'),
  attempt: (userId: string, idempotencyKey: string) => privateQueryKey(userId, 'orders', 'attempt', idempotencyKey),
}

/** Keeps whichever copy is newer: an order only moves forward (pending → settled). */
export function newestOrder(current: Order | undefined, incoming: Order): Order {
  return current && current.version > incoming.version ? current : incoming
}

function storeOrder(queryClient: QueryClient, userId: string, order: Order): void {
  queryClient.setQueryData<Order>(orderKeys.order(userId, order.orderId), (current) => newestOrder(current, order))
}

/**
 * One order. A settled order never changes again; a pending one follows
 * `order.updated` (useOrderRealtimeSync) and is read again after a reconnection.
 */
export function orderQueryOptions(queryClient: QueryClient, userId: string, orderId: string) {
  const key = orderKeys.order(userId, orderId)
  return queryOptions({
    queryKey: key,
    queryFn: async ({ signal }) => newestOrder(queryClient.getQueryData<Order>(key), await fetchOrder(orderId, signal)),
    staleTime: (query) => (query.state.data && query.state.data.status !== 'pending' ? Infinity : 0),
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

export function useOrder(userId: string, orderId: string) {
  return useQuery(orderQueryOptions(useQueryClient(), userId, orderId))
}

/** The user's pending orders, read when the app opens, on every change and after a reconnection. */
export function usePendingOrders(userId: string | null) {
  const queryClient = useQueryClient()
  return useQuery<Order[]>({
    queryKey: orderKeys.pending(userId ?? ''),
    queryFn: async ({ signal }) => {
      const orders = await fetchOrders({ status: 'pending' }, signal)
      for (const order of orders) storeOrder(queryClient, userId!, order)
      return orders
    },
    enabled: userId !== null,
    staleTime: 0,
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

/** The order created by a purchase attempt, if the server has one (null otherwise). */
export function useAttemptOrder(userId: string, idempotencyKey: string | null) {
  const queryClient = useQueryClient()
  return useQuery<Order | null>({
    queryKey: orderKeys.attempt(userId, idempotencyKey ?? ''),
    queryFn: async ({ signal }) => {
      const [order] = await fetchOrders({ idempotencyKey: idempotencyKey! }, signal)
      if (order) storeOrder(queryClient, userId, order)
      return order ?? null
    },
    enabled: idempotencyKey !== null,
    staleTime: Infinity,
  })
}

/**
 * Applies `order.updated` to the user's cached orders. The event carries no receipt,
 * so a newer version makes the order be read again over REST; an event whose version
 * is not newer than the cached order (duplicate, delayed, out of order) changes
 * nothing. Events of another user are dropped by the provider; the owner check keeps
 * the cache keys tied to the current session even so.
 */
export function useOrderRealtimeSync(userId: string): void {
  const queryClient = useQueryClient()
  useRealtimeEvent('order.updated', (event) => {
    if (event.userId !== userId || sessionStore.getSnapshot().userId !== userId) return
    const key = orderKeys.order(userId, event.payload.orderId)
    const cached = queryClient.getQueryData<Order>(key)
    if (cached && cached.version >= event.version) return
    void queryClient.invalidateQueries({ queryKey: key, exact: true })
    void queryClient.invalidateQueries({ queryKey: orderKeys.pending(userId), exact: true })
  })
}
