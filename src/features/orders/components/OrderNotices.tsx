import { useQueries, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { useState, useSyncExternalStore } from 'react'
import type { Order } from '@/contracts/orders'
import { cn } from '@/lib/utils'
import { sessionStore } from '@/shared/session/session-store'
import { orderQueryOptions, useOrderRealtimeSync, usePendingOrders } from '../queries'

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Orders of the signed-in user whose payment is still running, recovered from the
 * server when the app opens (and after a reconnection), and the outcome of each one
 * once it settles, wherever the user is in the app. The order's own page shows its
 * state itself, so its notice is hidden there.
 */
export function OrderNotices() {
  const { userId, epoch } = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot)
  return userId ? <FollowedOrders key={`${epoch}:${userId}`} userId={userId} /> : null
}

function FollowedOrders({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const pathname = useLocation({ select: (location) => location.pathname })
  const pending = usePendingOrders(userId)
  const [followed, setFollowed] = useState<string[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])

  const pendingIds = pending.data?.map((order) => order.orderId) ?? []
  const newlyPending = pendingIds.filter((id) => !followed.includes(id))
  if (newlyPending.length > 0) setFollowed([...followed, ...newlyPending])

  // Seeing the order's page counts as seeing its outcome.
  const openOrderId = pathname.startsWith('/orders/') ? pathname.slice('/orders/'.length) : null
  if (openOrderId && followed.includes(openOrderId) && !dismissed.includes(openOrderId) && !pendingIds.includes(openOrderId)) {
    setDismissed([...dismissed, openOrderId])
  }

  const finishedIds = followed.filter((id) => !pendingIds.includes(id) && !dismissed.includes(id))
  const finished = useQueries({
    queries: finishedIds.map((id) => orderQueryOptions(queryClient, userId, id)),
  })

  const shown: Order[] = [
    ...(pending.data ?? []),
    ...finished.flatMap((query) => (query.data && query.data.status !== 'pending' ? [query.data] : [])),
  ].filter((order) => order.orderId !== openOrderId && !dismissed.includes(order.orderId))

  return (
    <>
      {/* Listens only while there is an order to follow: none of the user's orders can change otherwise. */}
      {followed.length > 0 || openOrderId ? <OrderEvents userId={userId} /> : null}
      <div role="status" data-testid="order-notices" className={cn(shown.length === 0 && 'sr-only')}>
      {shown.map((order) => (
        <div
          key={order.orderId}
          data-testid="order-notice"
          data-order-id={order.orderId}
          data-status={order.status}
          className={cn(
            'border-b bg-surface-card px-4 py-2 text-caption-13 text-cream',
            order.status === 'pending' ? 'border-amber/40' : order.status === 'confirmed' ? 'border-brand/50' : 'border-coral/50',
          )}
        >
          <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2">
            <p>
              {order.status === 'pending'
                ? 'Você tem um pedido com pagamento em processamento. Ainda não há confirmação.'
                : order.status === 'confirmed'
                  ? 'O pagamento do seu pedido foi confirmado.'
                  : 'O pagamento do seu pedido foi recusado. Nenhum valor foi cobrado.'}
            </p>
            <Link
              to="/orders/$orderId"
              params={{ orderId: order.orderId }}
              className={cn('rounded-sm font-bold text-brand-accent underline', focusRing)}
            >
              {order.status === 'confirmed' ? 'Ver recibo' : 'Ver pedido'}
            </Link>
            {order.status === 'pending' ? null : (
              <button
                type="button"
                onClick={() => setDismissed((current) => [...current, order.orderId])}
                className={cn('rounded-[5px] border border-border-field px-3 py-1 hover:border-brand', focusRing)}
              >
                Fechar aviso
              </button>
            )}
          </div>
        </div>
      ))}
      </div>
    </>
  )
}

function OrderEvents({ userId }: { userId: string }) {
  useOrderRealtimeSync(userId)
  return null
}
