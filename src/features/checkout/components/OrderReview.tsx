import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode, Ref } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Cart, Quote } from '@/contracts/cart'
import type { QuoteChange, QuoteStaleDetails } from '@/contracts/orders'
import { formatEthDisplay } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { ApiError } from '@/shared/api/errors'
import { errorMessage } from '@/shared/forms/form-errors'
import { focusRing } from './checkout-ui'

const eth = (amount: string) => `${formatEthDisplay(amount)} ETH`

/**
 * Review of the order: every amount is the server's quote of the cart revision on
 * screen, verbatim. While it loads (or a new one is on its way after a change) the
 * values are hidden, never replaced by older ones.
 */
export function OrderReview({
  cart,
  quote,
  current,
  headingRef,
  children,
}: {
  cart: Cart
  quote: UseQueryResult<Quote>
  current: Quote | null
  headingRef: Ref<HTMLHeadingElement>
  children: ReactNode
}) {
  const recalculating = quote.isPending || (quote.isError && quote.error instanceof ApiError && quote.error.code === 'CART_CHANGED')
  const failed = quote.isError && !recalculating
  const names = new Map(cart.items.map((item) => [item.id, `${item.nft.name} · edição ${item.edition.name}`]))

  return (
    <section
      aria-labelledby="checkout-review-title"
      data-testid="checkout-review"
      data-quote-id={current?.quoteId}
      aria-busy={recalculating || quote.isFetching || undefined}
      className="flex flex-col gap-5 rounded-[16px] bg-surface-card p-5 lg:sticky lg:top-6 lg:w-[380px] lg:shrink-0"
    >
      <h2 id="checkout-review-title" ref={headingRef} tabIndex={-1} className="text-body-18 font-bold text-cream outline-none">
        Revisão do pedido
      </h2>
      <p role="status" className="sr-only">
        {recalculating ? 'Calculando o total…' : current ? `Total: ${eth(current.totalEth)}` : ''}
      </p>

      {failed ? (
        <div role="alert" data-testid="checkout-quote-error" className="flex flex-col items-start gap-3 rounded-[6px] border border-coral/60 p-4">
          <p className="text-body-14 text-cream">Não foi possível calcular o total. {errorMessage(quote.error)}</p>
          <button
            type="button"
            onClick={() => void quote.refetch()}
            className={cn('h-9 rounded-[6px] bg-brand px-3 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
          >
            Tentar novamente
          </button>
        </div>
      ) : current ? (
        <>
          <ul aria-label="Itens do pedido" className="flex flex-col gap-3">
            {current.lines.map((line) => (
              <li key={line.itemId} data-testid="checkout-line" data-item-id={line.itemId} className="flex justify-between gap-3 text-body-14">
                <span className="min-w-0 text-cream">
                  {names.get(line.itemId) ?? line.itemId}
                  <span className="block text-caption-12 text-text-secondary">
                    {line.quantity} × {eth(line.unitPriceEth)}
                  </span>
                </span>
                <span className="shrink-0 text-cream">{eth(line.lineTotalEth)}</span>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-2 border-t border-border-field pt-4 text-body-14 text-cream">
            <Amount label="Subtotal" testId="checkout-subtotal" value={eth(current.subtotalEth)} />
            <Amount
              label={current.coupon ? `Desconto (${current.coupon.code})` : 'Desconto'}
              testId="checkout-discount"
              value={`(-) ${eth(current.discountEth)}`}
            />
            <Amount label="Taxa de rede (estimada)" testId="checkout-fee" value={eth(current.networkFeeEth)} />
            <Amount label="Total" testId="checkout-total" value={eth(current.totalEth)} strong />
          </dl>
        </>
      ) : (
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      )}
      {children}
    </section>
  )
}

function Amount({ label, testId, value, strong }: { label: string; testId: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-4', strong && 'text-body-16 font-bold')}>
      <dt>{label}</dt>
      <dd data-testid={testId} className={cn(strong && 'text-brand-accent')}>
        {value}
      </dd>
    </div>
  )
}

function describeChange(change: QuoteChange): string {
  switch (change.kind) {
    case 'price-changed':
      return `${change.label}: o preço mudou de ${eth(change.previousUnitPriceEth)} para ${eth(change.currentUnitPriceEth)}.`
    case 'quantity-changed':
      return `${change.label}: a quantidade mudou de ${change.previousQuantity} para ${change.currentQuantity}.`
    case 'item-removed':
      return `${change.label} saiu do pedido.`
    case 'item-added':
      return `${change.label} entrou no pedido (${change.currentQuantity}).`
    case 'coupon-changed':
      if (change.currentCode) return `O cupom passou a ser ${change.currentCode}.`
      return change.previousCode ? `O cupom ${change.previousCode} deixou de valer.` : 'O cupom mudou.'
  }
}

const REASON_TEXT: Partial<Record<QuoteStaleDetails['reasons'][number], string>> = {
  'quote-expired': 'A cotação que você revisou venceu; os valores foram calculados de novo.',
  'quote-not-found': 'A cotação que você revisou não vale mais; os valores foram calculados de novo.',
}

/**
 * 409 QUOTE_STALE: what the server says changed, the previous and the new total, and
 * an explicit step back to the review. Nothing is sent again from here: the user
 * reviews the new values and confirms the purchase once more.
 */
export function QuoteChangedNotice({
  details,
  headingRef,
  onReview,
}: {
  details: QuoteStaleDetails
  headingRef: Ref<HTMLHeadingElement>
  onReview: () => void
}) {
  const reasons = details.reasons.map((reason) => REASON_TEXT[reason]).filter(Boolean)
  return (
    <section
      role="alert"
      aria-labelledby="quote-changed-title"
      data-testid="quote-changed"
      className="flex flex-col gap-3 rounded-[8px] border border-amber/70 bg-surface-raised p-4"
    >
      <h3 id="quote-changed-title" ref={headingRef} tabIndex={-1} className="text-body-16 font-bold text-amber outline-none">
        Os valores do pedido mudaram
      </h3>
      <p className="text-body-14 text-cream">Nada foi cobrado. Confira as mudanças e confirme a compra de novo.</p>
      {details.changes.length || reasons.length ? (
        <ul className="flex list-disc flex-col gap-1 pl-5 text-body-14 text-cream">
          {reasons.map((text) => (
            <li key={text}>{text}</li>
          ))}
          {details.changes.map((change, index) => (
            <li key={index}>{describeChange(change)}</li>
          ))}
        </ul>
      ) : null}
      {details.quote ? (
        <p data-testid="quote-changed-totals" className="text-body-14 text-cream">
          {details.previousTotalEth ? `Total anterior: ${eth(details.previousTotalEth)}. ` : ''}
          Novo total: <strong className="text-brand-accent">{eth(details.quote.totalEth)}</strong>.
        </p>
      ) : (
        <p className="text-body-14 text-cream">
          Seu carrinho ficou vazio.{' '}
          <Link to="/cart" className={cn('rounded-sm text-brand-accent underline', focusRing)}>
            Voltar ao carrinho
          </Link>
        </p>
      )}
      {details.quote ? (
        <button
          type="button"
          onClick={onReview}
          className={cn('h-10 self-start rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
        >
          Revisar novos valores
        </button>
      ) : null}
    </section>
  )
}
