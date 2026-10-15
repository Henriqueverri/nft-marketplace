import { Link } from '@tanstack/react-router'
import { useEffect, useRef, type ReactNode } from 'react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { Order } from '@/contracts/orders'
import { useAuthenticatedUser } from '@/features/auth/authenticated-user'
import { NftArtwork } from '@/features/catalog/artwork'
import { formatEthDisplay } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { ApiError } from '@/shared/api/errors'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { errorMessage } from '@/shared/forms/form-errors'
import { Icon } from '@/shared/ui/Icon'
import { useOrder } from '../queries'

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'
const primaryButton = cn(
  'inline-flex h-10 items-center justify-center rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink hover:bg-brand-accent aria-disabled:opacity-60',
  focusRing,
)
const secondaryButton = cn(
  'inline-flex h-10 items-center justify-center rounded-[6px] border border-brand px-4 text-body-14 font-bold text-brand-accent hover:bg-surface-raised',
  focusRing,
)
const eth = (amount: string) => `${formatEthDisplay(amount)} ETH`

const COPY: Record<Order['status'], { title: string; tone: string; announcement: string }> = {
  pending: { title: 'Pagamento em processamento', tone: 'text-amber', announcement: 'Pagamento em processamento.' },
  confirmed: { title: 'Pedido confirmado', tone: 'text-brand-accent', announcement: 'Pagamento confirmado. O recibo está disponível.' },
  rejected: { title: 'Pagamento recusado', tone: 'text-coral', announcement: 'Pagamento recusado. Nenhum valor foi cobrado.' },
}

/**
 * One order as the server reports it, with its receipt: the snapshot frozen when the
 * order was created, never recomputed. Pending, rejected and confirmed each have their
 * own screen; only a confirmed order shows the confirmation and the transaction. The
 * state follows `order.updated` (OrderNotices keeps the listener while this page is open).
 */
export function OrderStatusPage({ orderId }: { orderId: string }) {
  const user = useAuthenticatedUser()
  const order = useOrder(user.id, orderId)

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 pt-6 pb-12 md:px-6 md:pt-10 md:pb-16">
      {order.isPending ? (
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : order.isError ? (
        <OrderError error={order.error} onRetry={() => void order.refetch()} retrying={order.isFetching} />
      ) : (
        <OrderView order={order.data} refreshing={order.isFetching} onRefresh={() => void order.refetch()} />
      )}
    </div>
  )
}

function OrderView({ order, refreshing, onRefresh }: { order: Order; refreshing: boolean; onRefresh: () => void }) {
  const copy = COPY[order.status]
  const announce = useAnnounce()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownStatus = useRef(order.status)

  // A change seen on this page (event or refresh) is announced and the new screen gets the focus.
  useEffect(() => {
    if (shownStatus.current === order.status) return
    shownStatus.current = order.status
    announce(copy.announcement)
    headingRef.current?.focus()
  }, [order.status, copy.announcement, announce])

  return (
    <section
      data-testid="order-status"
      data-status={order.status}
      data-version={order.version}
      aria-labelledby="order-status-title"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-3">
        <h1
          id="order-status-title"
          ref={headingRef}
          tabIndex={-1}
          className={cn('text-title-20 font-bold outline-none md:text-heading-28', copy.tone)}
        >
          {copy.title}
        </h1>
        <StatusMessage order={order} />
      </header>

      <div className="flex flex-wrap gap-3">
        {order.status === 'pending' ? (
          <button
            type="button"
            onClick={() => !refreshing && onRefresh()}
            aria-disabled={refreshing || undefined}
            className={primaryButton}
          >
            {refreshing ? 'Atualizando…' : 'Atualizar status'}
          </button>
        ) : order.status === 'rejected' ? (
          <Link to="/cart" className={primaryButton}>
            Voltar ao carrinho
          </Link>
        ) : (
          <>
            <ExplorerDialog order={order} />
            <Link to="/" hash="catalogo" className={secondaryButton}>
              Continuar explorando
            </Link>
          </>
        )}
      </div>

      <Receipt order={order} />
    </section>
  )
}

function StatusMessage({ order }: { order: Order }) {
  if (order.status === 'pending') {
    return (
      <p role="status" className="flex items-start gap-2 text-body-15 text-cream">
        <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 animate-pulse rounded-full bg-amber motion-reduce:animate-none" />
        Recebemos o pedido e o pagamento ainda está sendo processado na rede. A compra ainda não foi confirmada. Esta página
        se atualiza sozinha quando houver uma resposta.
      </p>
    )
  }
  if (order.status === 'rejected') {
    return (
      <p role="status" data-testid="order-rejection" className="text-body-15 text-cream">
        O pedido não foi concluído. {order.rejection?.message ?? 'Nenhum valor foi cobrado.'}
      </p>
    )
  }
  return (
    <p role="status" className="text-body-15 text-cream">
      O pagamento foi confirmado e as edições são suas. Guarde este recibo.
    </p>
  )
}

/** The frozen snapshot; the transaction reference only once the payment is confirmed. */
function Receipt({ order }: { order: Order }) {
  const { receipt } = order
  const confirmed = order.status === 'confirmed'
  return (
    <div data-testid="order-receipt" className="flex flex-col gap-4 rounded-[16px] bg-surface-card p-4 md:p-6">
      <h2 className="text-body-18 font-bold text-cream">{confirmed ? 'Recibo' : 'Resumo do pedido'}</h2>
      <ul aria-label="Itens do pedido" className="flex flex-col gap-3">
        {receipt.lines.map((line) => (
          <li
            key={line.itemId}
            data-testid="receipt-line"
            data-item-id={line.itemId}
            className="flex items-center gap-3 border-b border-border-field pb-3 last:border-b-0"
          >
            <NftArtwork imageKey={line.imageKey} alt="" sizes="56px" className="size-14 shrink-0 rounded-[8px]" />
            <div className="flex min-w-0 flex-1 flex-col text-body-14 text-cream">
              <span className="font-bold break-words">{line.nftName}</span>
              <span className="text-caption-12 text-text-secondary">
                Edição {line.editionName} · Token {line.tokenId}
              </span>
              <span data-testid="receipt-line-quantity" className="text-caption-12 text-text-secondary">
                {line.quantity} × {eth(line.unitPriceEth)}
              </span>
            </div>
            <span data-testid="receipt-line-total" className="shrink-0 text-body-14 text-cream">
              {eth(line.lineTotalEth)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-2 text-body-14 text-cream">
        <Row label="Subtotal" testId="receipt-subtotal">
          {eth(receipt.subtotalEth)}
        </Row>
        <Row label={receipt.coupon ? `Desconto (cupom ${receipt.coupon.code})` : 'Desconto'} testId="receipt-discount">
          (-) {eth(receipt.discountEth)}
        </Row>
        <Row label="Taxa de rede" testId="receipt-fee">
          {eth(receipt.networkFeeEth)}
        </Row>
        <Row label="Total" testId="order-total" strong>
          {eth(receipt.totalEth)}
        </Row>
      </dl>

      <dl className="grid gap-x-4 gap-y-2 border-t border-border-field pt-4 text-body-14 text-cream sm:grid-cols-[auto_1fr]">
        <dt className="text-text-secondary">Pedido</dt>
        <dd data-testid="order-id" className="break-all">
          {order.orderId}
        </dd>
        <dt className="text-text-secondary">Data</dt>
        <dd>{new Date(order.createdAt).toLocaleString('pt-BR')}</dd>
        <dt className="text-text-secondary">Comprador</dt>
        <dd data-testid="receipt-buyer" className="break-words">
          {receipt.buyer.fullName} · {receipt.buyer.email}
        </dd>
        <dt className="text-text-secondary">Carteira</dt>
        <dd data-testid="receipt-wallet" className="break-all">
          {receipt.wallet.nickname} · {receipt.wallet.address}
        </dd>
        <dt className="text-text-secondary">Rede</dt>
        <dd data-testid="receipt-network">
          {receipt.network.name} ({receipt.network.currency})
        </dd>
        {confirmed ? (
          <>
            <dt className="text-text-secondary">Transação (simulada)</dt>
            <dd data-testid="receipt-transaction" className="font-mono text-caption-12 break-all">
              {receipt.transactionHash}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  )
}

function Row({ label, testId, strong, children }: { label: string; testId: string; strong?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between gap-4', strong && 'text-body-16 font-bold')}>
      <dt>{label}</dt>
      <dd data-testid={testId} className={cn(strong && 'text-brand-accent')}>
        {children}
      </dd>
    </div>
  )
}

/**
 * The demo has no chain: the reference is shown as what it is, a simulated URL, with
 * no link that would open an explorer looking for a transaction that does not exist.
 */
function ExplorerDialog({ order }: { order: Order }) {
  const { receipt } = order
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={primaryButton}>
          Ver transação no explorador
        </button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="w-[min(92vw,560px)] max-w-none gap-4 bg-surface-card p-5 sm:max-w-none">
        <div className="flex items-center justify-between gap-4">
          <DialogTitle className="text-body-16 font-bold text-cream">Transação simulada</DialogTitle>
          <DialogClose
            className={cn('flex size-9 items-center justify-center rounded-full text-cream hover:bg-surface-raised', focusRing)}
          >
            <Icon name="close" className="size-[18px]" />
            <span className="sr-only">Fechar</span>
          </DialogClose>
        </div>
        <DialogDescription className="text-body-14 text-cream">
          Esta é uma demonstração: nenhuma transação foi registrada na rede {receipt.network.name}. O endereço abaixo
          mostra apenas o formato que o explorador teria e não leva a uma transação real.
        </DialogDescription>
        <dl className="flex flex-col gap-2 text-body-14 text-cream">
          <dt className="text-text-secondary">Referência simulada</dt>
          <dd className="font-mono text-caption-12 break-all">{receipt.transactionHash}</dd>
          <dt className="text-text-secondary">URL simulada do explorador</dt>
          <dd data-testid="explorer-url" className="font-mono text-caption-12 break-all">
            {receipt.explorerUrl}
          </dd>
        </dl>
      </DialogContent>
    </Dialog>
  )
}

function OrderError({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying: boolean }) {
  const missing = error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'FORBIDDEN')
  return (
    <section role="alert" data-testid="order-status" data-status="error" className="flex flex-col items-start gap-3">
      <h1 className="text-title-20 font-bold text-cream md:text-heading-28">
        {missing ? 'Pedido não encontrado' : 'Não foi possível carregar o pedido'}
      </h1>
      <p className="text-body-14 text-text-secondary">
        {missing ? 'Confira o endereço ou volte ao carrinho.' : errorMessage(error)}
      </p>
      {missing ? (
        <Link to="/cart" className={primaryButton}>
          Voltar ao carrinho
        </Link>
      ) : (
        <button type="button" onClick={() => !retrying && onRetry()} aria-disabled={retrying || undefined} className={primaryButton}>
          Tentar novamente
        </button>
      )}
    </section>
  )
}
