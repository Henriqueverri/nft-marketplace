import type { UseQueryResult } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Cart, Quote } from '@/contracts/cart'
import { formatEthDisplay } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { ApiError } from '@/shared/api/errors'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { errorMessage } from '@/shared/forms/form-errors'
import { useRealtimeStatus, type RealtimeConnectionState } from '@/shared/realtime/context'
import { useApplyCoupon, useCartMutating, useRemoveCoupon } from '../queries'

const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

/** CART_CHANGED only means a newer revision is on its way: it is shown as recalculating. */
function isRecalculating(quote: UseQueryResult<Quote>): boolean {
  return quote.isPending || (quote.isError && quote.error instanceof ApiError && quote.error.code === 'CART_CHANGED')
}

/** Without a live socket, price and stock changes are not pushed: the quote may be behind. */
const OFFLINE_STATES = new Set<RealtimeConnectionState>(['disconnected', 'unavailable', 'rejected'])

/**
 * "Resumo da carteira" (Figma "Wallet Summary"; bottom sheet on mobile). Every amount
 * is the quote's, verbatim: nothing is added up here. While the quote of the current
 * revision is loading the values are hidden, and on failure they are replaced by the
 * error, so a total of another revision is never presented as current. The same
 * happens when the cart itself could not be refreshed (`unconfirmed`).
 *
 * A quote is only as fresh as the last event received. "Conectar e finalizar" asks
 * the server for a new quote of the same revision first (one request, on that click):
 * the server reconciles the cart with the catalog and answers 409 if anything moved,
 * so the user stays here and sees the new values instead of going on with old ones.
 */
export function CartSummary({
  cart,
  quote,
  unconfirmed,
  onRetryCart,
}: {
  cart: Cart
  quote: UseQueryResult<Quote>
  unconfirmed: boolean
  onRetryCart: () => void
}) {
  const navigate = useNavigate()
  const announce = useAnnounce()
  const mutating = useCartMutating()
  const { state: realtimeState } = useRealtimeStatus()
  const [verifying, setVerifying] = useState(false)
  const recalculating = !unconfirmed && isRecalculating(quote)
  const failed = !unconfirmed && quote.isError && !recalculating
  const shown = quote.isSuccess && !unconfirmed
  const current = shown && !mutating ? quote.data : null
  const offline = OFFLINE_STATES.has(realtimeState)

  async function proceed() {
    if (!current || verifying) return
    setVerifying(true)
    const result = await quote.refetch()
    setVerifying(false)
    if (result.isSuccess && result.data.cartRevision === cart.revision) {
      void navigate({ to: '/checkout' })
      return
    }
    announce('Os valores do carrinho mudaram. Confira o novo total antes de continuar.')
  }

  const amount = (testId: string, value: string | undefined, prefix = '') => (
    <span data-testid={testId} className="text-right">
      {shown && value !== undefined ? (
        `${prefix}${formatEthDisplay(value)} ETH`
      ) : (
        <Skeleton aria-hidden="true" className="inline-block h-4 w-20 align-middle" />
      )}
    </span>
  )

  return (
    <section
      aria-labelledby="cart-summary-title"
      data-testid="cart-summary"
      data-quote-id={shown ? quote.data.quoteId : undefined}
      data-cart-revision={cart.revision}
      aria-busy={recalculating || quote.isFetching || undefined}
      className="-mx-4 flex flex-col gap-6 rounded-t-[40px] bg-surface-card px-6 pt-6 pb-8 md:mx-0 md:rounded-[16px] lg:w-[332px] lg:shrink-0 lg:rounded-none lg:bg-transparent lg:p-0"
    >
      <div className="hidden flex-col gap-3 lg:flex">
        <h2 id="cart-summary-title" className="text-body-18 font-bold text-cream">
          Resumo da carteira
        </h2>
        <div aria-hidden="true" className="h-px bg-brand" />
      </div>
      <h2 className="sr-only lg:hidden">Resumo da carteira</h2>

      <CouponForm cart={cart} />

      <p role="status" className="sr-only">
        {recalculating ? 'Calculando o total…' : shown ? `Total: ${formatEthDisplay(quote.data.totalEth)} ETH` : ''}
      </p>

      {unconfirmed ? (
        <div role="alert" data-testid="quote-unconfirmed" className="flex flex-col items-start gap-3 rounded-[6px] border border-coral/60 p-4">
          <p className="text-body-14 text-cream">
            Não foi possível confirmar o total: o carrinho não pôde ser atualizado.
          </p>
          <button
            type="button"
            onClick={onRetryCart}
            className={cn('h-9 rounded-[6px] bg-brand px-3 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
          >
            Atualizar carrinho
          </button>
        </div>
      ) : failed ? (
        <div role="alert" data-testid="quote-error" className="flex flex-col items-start gap-3 rounded-[6px] border border-coral/60 p-4">
          <p className="text-body-14 text-cream">Não foi possível calcular o total. {errorMessage(quote.error)}</p>
          <button
            type="button"
            onClick={() => void quote.refetch()}
            className={cn('h-9 rounded-[6px] bg-brand px-3 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <dl className="flex flex-col gap-3 text-body-15 text-cream">
          <Row label="Subtotal" valueClass="text-body-16 lg:text-body-18">
            {amount('quote-subtotal', quote.data?.subtotalEth)}
          </Row>
          <Row label={quote.data?.coupon ? `Desconto (${quote.data.coupon.code})` : 'Desconto do lançamento'}>
            {amount('quote-discount', quote.data?.discountEth, '(-) ')}
          </Row>
          <Row label="Taxa de rede" valueClass="text-body-16 lg:text-body-18">
            {amount('quote-fee', quote.data?.networkFeeEth)}
          </Row>
          <p className="-mt-2 text-right text-caption-12 text-brand-accent">Taxa estimada</p>
          <Row label="Total" labelClass="text-body-16 font-bold" valueClass="text-body-18 font-bold text-brand-accent">
            {amount('quote-total', quote.data?.totalEth)}
          </Row>
        </dl>
      )}

      {offline && shown ? (
        <p data-testid="quote-unverified" className="text-caption-13 text-amber">
          Sem atualização em tempo real: preços e estoque podem ter mudado. O total será conferido de novo ao finalizar.
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-3">
        {/* aria-disabled keeps the focus when the quote goes stale under the user's cursor. */}
        <button
          type="button"
          aria-disabled={!current || verifying || undefined}
          onClick={() => void proceed()}
          className={cn(
            'h-[60px] w-full rounded-[40px] bg-linear-to-r from-brand to-brand/80 text-body-16 font-bold text-ink hover:to-brand-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
            'lg:h-10 lg:rounded-[3px] lg:bg-none lg:bg-brand lg:text-body-15 lg:hover:bg-brand-accent',
            focusRing,
          )}
        >
          {verifying ? 'Conferindo valores…' : 'Conectar e finalizar'}
        </button>
        <Link to="/" hash="catalogo" className={cn('rounded-sm text-body-15 text-brand-accent hover:underline', focusRing)}>
          Continuar explorando
        </Link>
      </div>
    </section>
  )
}

function Row({
  label,
  children,
  labelClass,
  valueClass,
}: {
  label: string
  children: ReactNode
  labelClass?: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={labelClass}>{label}</dt>
      <dd className={valueClass}>{children}</dd>
    </div>
  )
}

/**
 * Coupon field (Figma "Promo Code"). The server decides: a code is applied only when
 * PUT /cart/coupon accepts it, and the new values come from the next quote.
 *
 * Applying replaces the field with "Remover cupom" and removing brings the field
 * back; the focus follows to the control that replaced the one the user activated
 * (only if it was lost with it). While a request is in flight the buttons are
 * aria-disabled and their handlers ignore new activations.
 */
function CouponForm({ cart }: { cart: Cart }) {
  const apply = useApplyCoupon()
  const remove = useRemoveCoupon()
  const announce = useAnnounce()
  const [code, setCode] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const focusAfterChange = useRef<'remove' | 'input' | null>(null)
  const appliedCode = cart.coupon?.code ?? null

  useEffect(() => {
    const target = focusAfterChange.current
    if (!target || (target === 'remove') !== (appliedCode !== null)) return
    focusAfterChange.current = null
    if (document.activeElement && document.activeElement !== document.body) return
    ;(target === 'remove' ? removeRef.current : inputRef.current)?.focus()
  }, [appliedCode])

  const serverError =
    apply.error && !(apply.error instanceof ApiError && apply.error.code === 'SESSION_CHANGED') ? apply.error : null
  const error = clientError ?? (serverError ? errorMessage(serverError) : null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (apply.isPending) return
    remove.reset()
    if (!code.trim()) {
      setClientError('Digite o código promocional.')
      return
    }
    setClientError(null)
    focusAfterChange.current = 'remove'
    apply.mutate(code, {
      onSuccess: ({ cart: next }) => {
        setCode('')
        if (next.coupon) announce(`Cupom ${next.coupon.code} aplicado: ${next.coupon.percentOff}% de desconto.`)
      },
      onError: () => {
        focusAfterChange.current = null
      },
    })
  }

  function removeCoupon() {
    if (remove.isPending) return
    apply.reset()
    focusAfterChange.current = 'input'
    remove.mutate(undefined, {
      onSuccess: () => announce('Cupom removido.'),
      onError: () => {
        focusAfterChange.current = null
      },
    })
  }

  if (cart.coupon) {
    return (
      <div className="flex flex-col gap-2" data-testid="coupon-applied">
        <p className="text-body-14 text-cream">
          Cupom <strong className="text-brand-accent">{cart.coupon.code}</strong> aplicado: {cart.coupon.percentOff}% de
          desconto.
        </p>
        <button
          ref={removeRef}
          type="button"
          onClick={removeCoupon}
          aria-disabled={remove.isPending || undefined}
          className={cn('self-start rounded-sm text-body-14 text-brand-accent underline aria-disabled:opacity-50', focusRing)}
        >
          {remove.isPending ? 'Removendo cupom…' : 'Remover cupom'}
        </button>
        {remove.error ? (
          <p role="alert" className="text-caption-13 text-coral">
            {errorMessage(remove.error)}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <label htmlFor={inputId} className="sr-only text-body-14 font-bold text-cream lg:not-sr-only">
        Código promocional
      </label>
      <div
        className={cn(
          'flex h-[50px] items-stretch overflow-hidden rounded-[40px] border border-border-field bg-surface-card has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
          'lg:h-10 lg:rounded-[3px] lg:border-brand lg:bg-transparent',
          error && 'border-coral lg:border-coral',
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          value={code}
          onChange={(event) => {
            setCode(event.target.value)
            setClientError(null)
            if (apply.isError) apply.reset()
          }}
          placeholder="Digite o código promocional..."
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 flex-1 bg-transparent px-4 text-caption-13 text-cream outline-none placeholder:text-sand lg:px-2 lg:text-caption-12"
        />
        <button
          type="submit"
          aria-disabled={apply.isPending || undefined}
          className={cn(
            'shrink-0 rounded-[40px] bg-linear-to-r from-brand/55 to-brand px-4 text-body-15 font-bold text-cream aria-disabled:opacity-60',
            'lg:w-[102px] lg:rounded-none lg:bg-none lg:bg-brand lg:text-ink lg:hover:bg-brand-accent',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          )}
        >
          {apply.isPending ? 'Aplicando…' : 'Aplicar'}
        </button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-caption-13 text-coral">
          {error}
        </p>
      ) : null}
    </form>
  )
}
