import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import type { Order } from '@/contracts/orders'
import { AccountShell } from '@/features/account/AccountShell'
import { useAuthenticatedUser } from '@/features/auth/authenticated-user'
import { NftArtwork } from '@/features/catalog/artwork'
import { formatEthDisplay } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/shared/forms/form-errors'
import { useOrderHistory, useOrderRealtimeSync } from '../queries'

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const STATUS: Record<Order['status'], { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'border-amber/60 text-amber' },
  confirmed: { label: 'Confirmado', className: 'border-brand/60 text-brand-accent' },
  rejected: { label: 'Rejeitado', className: 'border-coral/60 text-coral' },
}

export function OrderHistoryPage() {
  const user = useAuthenticatedUser()
  const history = useOrderHistory(user.id)
  useOrderRealtimeSync(user.id)

  return (
    <AccountShell>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-heading-28 font-bold text-cream max-md:sr-only">Histórico de pedidos</h1>
          <p className="mt-2 text-body-14 text-text-secondary">
            Acompanhe seus pagamentos e consulte os detalhes de cada pedido.
          </p>
        </header>

        {history.isPending ? (
          <HistorySkeleton />
        ) : history.isError ? (
          <section role="alert" className="flex flex-col items-start gap-3 py-6">
            <h2 className="text-title-20 font-bold text-cream">Não foi possível carregar seus pedidos</h2>
            <p className="text-body-14 text-text-secondary">{errorMessage(history.error)}</p>
            <button
              type="button"
              onClick={() => void history.refetch()}
              aria-disabled={history.isFetching || undefined}
              className={cn('h-10 rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
            >
              {history.isFetching ? 'Tentando novamente…' : 'Tentar novamente'}
            </button>
          </section>
        ) : history.data.length === 0 ? (
          <EmptyHistory />
        ) : (
          <ol aria-label="Pedidos, do mais recente para o mais antigo" className="flex flex-col gap-4">
            {history.data.map((order) => (
              <li key={order.orderId}>
                <OrderCard order={order} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </AccountShell>
  )
}

function HistorySkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4">
      {[0, 1, 2].map((item) => (
        <Skeleton key={item} className="h-52 w-full rounded-[12px]" />
      ))}
    </div>
  )
}

function EmptyHistory() {
  return (
    <section data-testid="orders-empty" className="flex flex-col items-start gap-3 rounded-[12px] bg-surface-card p-5 md:p-6">
      <h2 className="text-title-20 font-bold text-cream">Você ainda não fez nenhum pedido</h2>
      <p className="text-body-14 text-text-secondary">
        Explore o marketplace e escolha sua primeira obra digital.
      </p>
      <Link
        to="/"
        hash="catalogo"
        className={cn('inline-flex h-10 items-center rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
      >
        Explorar marketplace
      </Link>
    </section>
  )
}

function OrderCard({ order }: { order: Order }) {
  const status = STATUS[order.status]
  return (
    <article
      data-testid="order-history-item"
      data-order-id={order.orderId}
      data-created-at={order.createdAt}
      data-status={order.status}
      className="flex flex-col gap-4 rounded-[12px] bg-surface-card p-4 md:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-all text-body-16 font-bold text-cream">Pedido {order.orderId}</h2>
          <time dateTime={order.createdAt} className="text-caption-13 text-text-secondary">
            {dateTime.format(new Date(order.createdAt))}
          </time>
        </div>
        <span
          role="status"
          aria-label={`Status do pedido: ${status.label}`}
          className={cn('rounded-full border px-3 py-1 text-caption-13 font-bold', status.className)}
        >
          {status.label}
        </span>
      </header>

      <ul aria-label={`NFTs do pedido ${order.orderId}`} className="grid gap-2 sm:grid-cols-2">
        {order.receipt.lines.map((line) => (
          <li key={line.itemId} className="flex min-w-0 items-center gap-3">
            <NftArtwork imageKey={line.imageKey} alt="" sizes="48px" className="size-12 shrink-0 rounded-[7px]" />
            <span className="min-w-0 text-body-14 text-cream">
              <span className="block truncate font-bold">{line.nftName}</span>
              <span className="block text-caption-12 text-text-secondary">
                {line.quantity} {line.quantity === 1 ? 'unidade' : 'unidades'} · Edição {line.editionName}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-field pt-4">
        <p className="text-body-14 text-text-secondary">
          Total{' '}
          <strong data-testid="order-history-total" className="text-body-16 text-cream">
            {formatEthDisplay(order.receipt.totalEth)} ETH
          </strong>
        </p>
        <Link
          to="/orders/$orderId"
          params={{ orderId: order.orderId }}
          aria-label={`${order.status === 'confirmed' ? 'Ver recibo' : 'Ver detalhes'} do pedido ${order.orderId}`}
          className={cn('rounded-[5px] border border-brand px-4 py-2 text-body-14 font-bold text-brand-accent hover:bg-surface-raised', focusRing)}
        >
          {order.status === 'confirmed' ? 'Ver recibo' : 'Ver detalhes'}
        </Link>
      </footer>
    </article>
  )
}
