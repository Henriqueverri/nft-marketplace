import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { NetworkId } from '@/contracts/catalog'
import type { Cart } from '@/contracts/cart'
import { buyerSchema, type CreateOrderRequest, type QuoteStaleDetails } from '@/contracts/orders'
import type { AccountUser } from '@/contracts/account'
import type { Wallet, WalletConnection } from '@/contracts/wallets'
import { useAuthenticatedUser } from '@/features/auth/authenticated-user'
import { cartKeys, useCart, useQuote, type CartIdentity } from '@/features/cart/queries'
import { createOrder, quoteStaleDetails } from '@/features/orders/api'
import { orderKeys, useAttemptOrder } from '@/features/orders/queries'
import { fetchWalletConnection } from '@/features/wallets/api'
import { useWallets, walletKeys } from '@/features/wallets/queries'
import { cn } from '@/lib/utils'
import { ApiError } from '@/shared/api/errors'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { TextField } from '@/shared/forms/fields'
import { errorMessage, fieldErrorsFromZod, firstInvalidField, type FieldErrors } from '@/shared/forms/form-errors'
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query'
import { readDraft, writeDraft } from '@/shared/session/drafts'
import { Icon } from '@/shared/ui/Icon'
import { attemptFor, clearAttempt, readAttempt, type PurchaseAttempt } from '../purchase-attempt'
import { focusRing } from './checkout-ui'
import { OrderReview, QuoteChangedNotice } from './OrderReview'
import { WalletSection } from './WalletSection'

const container = 'mx-auto flex w-full max-w-[1200px] flex-col px-4 md:px-6 xl:px-0'
const BUYER_DRAFT = 'checkout.buyer'
const NOT_CONNECTED = 'Conecte a carteira para continuar.'

type Field = 'fullName' | 'email' | 'network' | 'wallet'
const FIELD_ORDER: readonly Field[] = ['fullName', 'email', 'network', 'wallet']
const API_FIELDS: Record<string, Field> = {
  'buyer.fullName': 'fullName',
  'buyer.email': 'email',
  networkId: 'network',
  walletId: 'wallet',
}

/**
 * Payment (Figma "Pagamento"; mobile "Pagamento com carteira"): collector data,
 * network and wallet, and the review of the server's quote, in one form. The order is
 * created from the quote on screen; the client sends no amount.
 */
export function CheckoutPage() {
  const user = useAuthenticatedUser()
  const { identity, cart, isPending, error, refetch } = useCart()
  // The order settling empties the cart, maybe while its answer is still awaited: the
  // attempt stays on screen with the cart it was paying for, or, if the page opened on
  // an emptied cart, the attempt that existed then is looked up instead of resent.
  const [openedAttemptKey] = useState(() => readAttempt(user.id)?.key ?? null)
  const [paying, setPaying] = useState<Cart | null>(null)
  if (cart && cart.items.length > 0 && cart !== paying) setPaying(cart)
  const emptied = cart?.items.length === 0
  const shown = emptied && paying && readAttempt(user.id) ? paying : cart

  return (
    <div className={cn(container, 'gap-6 pt-4 pb-12 md:pt-6 md:pb-16')}>
      <CheckoutHeader />
      {isPending ? (
        <div aria-hidden="true" className="flex flex-col gap-4 lg:flex-row">
          <Skeleton className="h-80 flex-1" />
          <Skeleton className="h-80 lg:w-[380px]" />
        </div>
      ) : !cart ? (
        <section role="alert" className="flex flex-col items-start gap-3 py-8">
          <h2 className="text-title-20 font-bold text-cream">Não foi possível carregar o carrinho</h2>
          <p className="text-body-14 text-text-secondary">{errorMessage(error)}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className={cn('h-10 rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
          >
            Tentar novamente
          </button>
        </section>
      ) : shown && shown.items.length > 0 ? (
        <CheckoutForm key={user.id} user={user} identity={identity} cart={shown} />
      ) : openedAttemptKey && !paying ? (
        <OpenedAttempt userId={user.id} attemptKey={openedAttemptKey} />
      ) : (
        <EmptyCart />
      )}
    </div>
  )
}

function EmptyCart() {
  return (
    <section className="flex flex-col items-start gap-3 py-8" data-testid="checkout-empty">
      <h2 className="text-title-20 font-bold text-cream">Seu carrinho está vazio</h2>
      <p className="text-body-14 text-text-secondary">Adicione NFTs ao carrinho para finalizar uma compra.</p>
      <Link to="/" hash="catalogo" className={cn('h-10 rounded-[6px] bg-brand px-4 py-2.5 text-body-14 font-bold text-ink', focusRing)}>
        Explorar NFTs
      </Link>
    </section>
  )
}

/** An attempt left before the page opened on an empty cart: its order, if the server has one. */
function OpenedAttempt({ userId, attemptKey }: { userId: string; attemptKey: string }) {
  const order = useAttemptOrder(userId, attemptKey)
  useEffect(() => {
    if (order.isSuccess) clearAttempt(userId)
  }, [order.isSuccess, userId])

  if (order.isPending) return <Skeleton aria-hidden="true" className="h-32 w-full lg:w-[380px]" />
  if (order.isError) {
    return (
      <section role="alert" className="flex flex-col items-start gap-3 py-8">
        <p className="text-body-14 text-cream">Não foi possível verificar a última compra. {errorMessage(order.error)}</p>
        <button
          type="button"
          onClick={() => void order.refetch()}
          className={cn('h-10 rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
        >
          Tentar novamente
        </button>
      </section>
    )
  }
  if (!order.data) return <EmptyCart />
  return <RecoveredOrderNotice orderId={order.data.orderId} />
}

function CheckoutHeader() {
  const router = useRouter()
  return (
    <>
      <nav aria-label="Trilha de navegação" className="hidden md:block">
        <ol className="flex gap-1 text-body-15 font-bold text-cream">
          <li>
            <Link to="/" className={cn('rounded-sm hover:text-brand-accent', focusRing)}>
              Início
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/cart" className={cn('rounded-sm hover:text-brand-accent', focusRing)}>
              Carrinho
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Pagamento</li>
        </ol>
      </nav>
      <div className="relative flex h-[35px] items-center justify-center md:h-auto md:justify-start">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: '/cart' }))}
          className={cn(
            'absolute left-0 flex size-[35px] items-center justify-center rounded-full border border-border-field bg-surface-raised text-sand md:hidden',
            focusRing,
          )}
        >
          <Icon name="arrow-left" className="size-5" />
        </button>
        <h1 className="text-title-20 font-bold text-cream md:text-heading-28">Pagamento</h1>
      </div>
    </>
  )
}

type SendStatus =
  | { kind: 'idle' }
  | { kind: 'uncertain'; attempt: PurchaseAttempt }
  | { kind: 'conflict' }
  | { kind: 'failed'; message: string }

function initialBuyer(user: AccountUser): { fullName: string; email: string } {
  const draft = readDraft(user.id, BUYER_DRAFT)
  if (draft) {
    try {
      const parsed = JSON.parse(draft) as { fullName?: unknown; email?: unknown }
      if (typeof parsed.fullName === 'string' && typeof parsed.email === 'string') {
        return { fullName: parsed.fullName, email: parsed.email }
      }
    } catch {
      // An unreadable draft falls back to the account data.
    }
  }
  return { fullName: user.displayName, email: user.email }
}

function CheckoutForm({ user, identity, cart }: { user: AccountUser; identity: CartIdentity; cart: Cart }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const desktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const quote = useQuote(identity, cart)
  const wallets = useWallets(user.id)

  const [buyer, setBuyer] = useState(() => initialBuyer(user))
  const [chosenNetwork, setChosenNetwork] = useState<NetworkId | null>(null)
  const [chosenWallet, setChosenWallet] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors<Field>>({})
  const [status, setStatus] = useState<SendStatus>(() => {
    const stored = readAttempt(user.id)
    return stored ? { kind: 'uncertain', attempt: stored } : { kind: 'idle' }
  })
  const [stale, setStale] = useState<QuoteStaleDetails | null>(null)
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  // An attempt left from before this page opened (refresh, lost answer): the server is
  // asked, read-only, whether it already created that order. Nothing is sent from here.
  const [storedKey] = useState(() => (status.kind === 'uncertain' ? status.attempt.key : null))
  const attemptOrder = useAttemptOrder(user.id, status.kind === 'uncertain' && status.attempt.key === storedKey ? storedKey : null)
  const recoveredOrder = status.kind === 'uncertain' && attemptOrder.data ? attemptOrder.data : null
  useEffect(() => {
    if (recoveredOrder) clearAttempt(user.id)
  }, [recoveredOrder, user.id])

  const fullNameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const networkRef = useRef<HTMLInputElement>(null)
  const walletRef = useRef<HTMLInputElement>(null)
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null)
  const staleHeadingRef = useRef<HTMLHeadingElement>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const answeredRef = useRef(false)

  // After the review has rendered: the changes, or the answer of a send that left focus nowhere.
  useEffect(() => {
    if (stale) staleHeadingRef.current?.focus()
  }, [stale])
  useEffect(() => {
    if (!answeredRef.current) return
    answeredRef.current = false
    if (status.kind !== 'idle' && document.activeElement === document.body) statusRef.current?.focus()
  }, [status])

  const placeOrder = useMutation({ mutationFn: (attempt: PurchaseAttempt) => createOrder(attempt.key, attempt.request) })

  // Defaults follow the primary wallet until the user picks something else.
  const list: Wallet[] = wallets.data ?? []
  const primary = list.find((wallet) => wallet.slot === 'primary') ?? list[0]
  const networkId = chosenNetwork ?? primary?.networkId ?? null
  const ofNetwork = list.filter((wallet) => wallet.networkId === networkId)
  const wallet = ofNetwork.find((candidate) => candidate.id === chosenWallet) ?? ofNetwork[0] ?? null

  const current = quote.isSuccess && quote.data.cartRevision === cart.revision ? quote.data : null
  const blocked = sending || stale !== null || current === null

  function updateBuyer(field: 'fullName' | 'email', value: string) {
    const next = { ...buyer, [field]: value }
    setBuyer(next)
    writeDraft(user.id, BUYER_DRAFT, JSON.stringify(next))
    if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined }))
  }

  function focusField(field: Field | undefined) {
    const target = { fullName: fullNameRef, email: emailRef, network: networkRef, wallet: walletRef }[field ?? 'fullName']
    target.current?.focus()
  }

  function showFieldErrors(next: FieldErrors<Field>) {
    setErrors(next)
    focusField(firstInvalidField(FIELD_ORDER, next))
  }

  function validate(): CreateOrderRequest | null {
    const parsedBuyer = buyerSchema.safeParse(buyer)
    const next: FieldErrors<Field> = parsedBuyer.success ? {} : fieldErrorsFromZod<Field>(parsedBuyer.error)
    if (!networkId) next.network = 'Escolha a rede do pagamento.'
    else if (!wallet) next.wallet = 'Escolha uma carteira desta rede.'
    else if (queryClient.getQueryData<WalletConnection>(walletKeys.connection(user.id, wallet.id))?.status === 'disconnected') {
      next.wallet = NOT_CONNECTED
    }
    if (Object.values(next).some(Boolean) || !parsedBuyer.success || !wallet || !networkId || !current) {
      showFieldErrors(next)
      return null
    }
    setErrors({})
    return {
      quoteId: current.quoteId,
      cartRevision: current.cartRevision,
      walletId: wallet.id,
      networkId,
      buyer: parsedBuyer.data,
    }
  }

  function goToOrder(orderId: string) {
    void navigate({ to: '/orders/$orderId', params: { orderId } })
  }

  function handleFailure(error: unknown, attempt: PurchaseAttempt) {
    if (!(error instanceof ApiError)) {
      setStatus({ kind: 'uncertain', attempt })
      return
    }
    // The session ended: the guard takes the user to sign in; the attempt stays for the retry.
    if (error.code === 'SESSION_CHANGED' || error.isUnauthenticated) return
    if (error.code === 'QUOTE_STALE') {
      clearAttempt(user.id)
      const details = quoteStaleDetails(error)
      // An earlier send of this purchase (whose answer was lost) already created the order.
      if (details?.reasons.includes('quote-used') && details.orderId) {
        announce('Este pedido já tinha sido enviado.')
        goToOrder(details.orderId)
        return
      }
      setStatus({ kind: 'idle' })
      setStale(details ?? { reasons: ['cart-changed'], changes: [], previousTotalEth: null, quote: null, orderId: null })
      void queryClient.resetQueries({ queryKey: cartKeys.quotes(identity) })
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart(identity), exact: true })
      return
    }
    if (error.code === 'IDEMPOTENCY_CONFLICT') {
      clearAttempt(user.id)
      setStatus({ kind: 'conflict' })
      return
    }
    if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || error.code === 'CANCELED' || error.transient) {
      setStatus({ kind: 'uncertain', attempt })
      return
    }
    clearAttempt(user.id)
    if (error.code === 'VALIDATION_FAILED') {
      const next: FieldErrors<Field> = {}
      for (const [apiField, messages] of Object.entries(error.fieldErrors)) {
        const field = API_FIELDS[apiField]
        if (field && messages[0]) next[field] ??= messages[0]
      }
      if (Object.keys(next).length) {
        setStatus({ kind: 'idle' })
        showFieldErrors(next)
        return
      }
    }
    setStatus({ kind: 'failed', message: error.message })
  }

  async function send(attempt: PurchaseAttempt) {
    if (sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    try {
      // The wallet app may have dropped the connection since it was shown as connected.
      const connectionKey = walletKeys.connection(user.id, attempt.request.walletId)
      const wasConnected = queryClient.getQueryData<WalletConnection>(connectionKey)?.status === 'connected'
      const connection = await queryClient.fetchQuery({
        queryKey: connectionKey,
        queryFn: ({ signal }) => fetchWalletConnection(attempt.request.walletId, signal),
        staleTime: 0,
      })
      if (connection.status !== 'connected') {
        showFieldErrors({
          wallet: wasConnected ? 'A carteira foi desconectada. Conecte de novo para continuar.' : NOT_CONNECTED,
        })
        return
      }
      const order = await placeOrder.mutateAsync(attempt)
      clearAttempt(user.id)
      setStatus({ kind: 'idle' })
      queryClient.setQueryData(orderKeys.order(user.id, order.orderId), order)
      announce('Pedido enviado. Acompanhe o pagamento.')
      goToOrder(order.orderId)
    } catch (error) {
      answeredRef.current = true
      handleFailure(error, attempt)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (blocked || sendingRef.current) return
    const request = validate()
    if (!request) return
    void send(attemptFor(user.id, request))
  }

  function reviewNewValues() {
    setStale(null)
    reviewHeadingRef.current?.focus()
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Pagamento" className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
      <div className="flex flex-1 flex-col gap-8">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-body-16 font-bold text-cream">Dados do colecionador</legend>
          <TextField
            id="checkout-full-name"
            label="Nome completo"
            placeholder="Nome completo"
            variant={desktop ? 'dialog' : 'page'}
            autoComplete="name"
            value={buyer.fullName}
            onChange={(event) => updateBuyer('fullName', event.target.value)}
            error={errors.fullName}
            inputRef={fullNameRef}
          />
          <TextField
            id="checkout-email"
            label="E-mail"
            placeholder="E-mail"
            type="email"
            variant={desktop ? 'dialog' : 'page'}
            autoComplete="email"
            value={buyer.email}
            onChange={(event) => updateBuyer('email', event.target.value)}
            error={errors.email}
            inputRef={emailRef}
          />
        </fieldset>

        {wallets.isPending ? (
          <Skeleton aria-hidden="true" className="h-40 w-full" />
        ) : wallets.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-body-14 text-coral">Não foi possível carregar suas carteiras. {errorMessage(wallets.error)}</p>
            <button
              type="button"
              onClick={() => void wallets.refetch()}
              className={cn('h-9 rounded-[6px] bg-brand px-3 text-body-14 font-bold text-ink', focusRing)}
            >
              Tentar novamente
            </button>
          </div>
        ) : list.length === 0 ? (
          <p className="text-body-14 text-text-secondary">
            Você ainda não tem carteiras cadastradas.{' '}
            <Link to="/account/wallets" className={cn('rounded-sm text-brand-accent underline', focusRing)}>
              Cadastrar carteira
            </Link>
          </p>
        ) : (
          <WalletSection
            userId={user.id}
            wallets={list}
            networkId={networkId}
            walletId={wallet?.id ?? null}
            onNetworkChange={(id) => {
              setChosenNetwork(id)
              setChosenWallet(null)
              setErrors((previous) => ({ ...previous, network: undefined, wallet: undefined }))
            }}
            onWalletChange={(id) => {
              setChosenWallet(id)
              setErrors((previous) => ({ ...previous, wallet: undefined }))
            }}
            networkError={errors.network}
            walletError={errors.wallet}
            networkRef={networkRef}
            walletRef={walletRef}
          />
        )}
      </div>

      <OrderReview cart={cart} quote={quote} current={stale ? null : current} headingRef={reviewHeadingRef}>
        {stale ? <QuoteChangedNotice details={stale} headingRef={staleHeadingRef} onReview={reviewNewValues} /> : null}
        <SendStatusNotice
          status={status}
          recoveredOrderId={recoveredOrder?.orderId ?? null}
          statusRef={statusRef}
          sending={sending}
          onRetry={(attempt) => void send(attempt)}
        />
        {/* aria-disabled keeps the focus on the button while the order is being sent. */}
        <button
          type="submit"
          aria-disabled={blocked || undefined}
          className={cn(
            'h-[60px] w-full rounded-[40px] bg-linear-to-r from-brand to-brand/80 text-body-16 font-bold text-ink hover:to-brand-accent aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
            'lg:h-10 lg:rounded-[3px] lg:bg-none lg:bg-brand lg:text-body-15 lg:hover:bg-brand-accent',
            focusRing,
          )}
        >
          {sending ? 'Enviando pedido…' : 'Confirmar compra'}
        </button>
        <Link to="/cart" className={cn('self-center rounded-sm text-body-15 text-brand-accent hover:underline', focusRing)}>
          Voltar ao carrinho
        </Link>
      </OrderReview>
    </form>
  )
}

function RecoveredOrderNotice({ orderId }: { orderId: string }) {
  return (
    <div
      role="status"
      data-testid="checkout-send-status"
      data-recovered-order-id={orderId}
      className="flex flex-col items-start gap-3 rounded-[8px] border border-amber/60 p-4"
    >
      <p className="text-body-14 text-cream">
        O pedido desta compra já tinha sido registrado; nada foi enviado de novo. Acompanhe o pagamento na página do pedido.
      </p>
      <Link
        to="/orders/$orderId"
        params={{ orderId }}
        className={cn('h-9 rounded-[6px] bg-brand px-3 py-2 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
      >
        Ver pedido
      </Link>
    </div>
  )
}

/**
 * The answer of the last send when it was not an order: unknown (timeout, network,
 * server error: the order may exist, so the retry repeats the same attempt), a reused
 * key, or a final failure. Never presented as a success. An unknown answer whose order
 * the server turned out to have links to that order instead.
 */
function SendStatusNotice({
  status,
  recoveredOrderId,
  statusRef,
  sending,
  onRetry,
}: {
  status: SendStatus
  recoveredOrderId: string | null
  statusRef: Ref<HTMLDivElement>
  sending: boolean
  onRetry: (attempt: PurchaseAttempt) => void
}) {
  if (status.kind === 'idle') return null
  if (recoveredOrderId) return <RecoveredOrderNotice orderId={recoveredOrderId} />
  return (
    <div
      ref={statusRef}
      tabIndex={-1}
      role="alert"
      data-testid="checkout-send-status"
      className="flex flex-col items-start gap-3 rounded-[8px] border border-coral/60 p-4 outline-none"
    >
      {status.kind === 'uncertain' ? (
        <>
          <p className="text-body-14 text-cream">
            Não recebemos a confirmação do envio do pedido. Ele pode ter sido registrado. Tente de novo: o mesmo envio é
            reaproveitado e não cria outro pedido.
          </p>
          <button
            type="button"
            onClick={() => onRetry(status.attempt)}
            aria-disabled={sending || undefined}
            className={cn(
              'h-9 rounded-[6px] bg-brand px-3 text-body-14 font-bold text-ink hover:bg-brand-accent aria-disabled:opacity-60',
              focusRing,
            )}
          >
            {sending ? 'Enviando…' : 'Tentar enviar de novo'}
          </button>
        </>
      ) : status.kind === 'conflict' ? (
        <p className="text-body-14 text-cream">
          Esta tentativa de compra já tinha sido usada com outros dados e não foi enviada de novo. Revise o pedido e confirme
          outra vez.
        </p>
      ) : (
        <p className="text-body-14 text-cream">O pedido não foi criado. {status.message}</p>
      )}
    </div>
  )
}
