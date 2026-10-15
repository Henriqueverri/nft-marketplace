import { Link, useRouter } from '@tanstack/react-router'
import { useLayoutEffect, useRef, type FocusEvent, type RefObject } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Cart } from '@/contracts/cart'
import { NftCarousel } from '@/features/catalog/components/NftCarousel'
import { useRecommendedNfts } from '@/features/catalog/queries'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/shared/forms/form-errors'
import { Icon } from '@/shared/ui/Icon'
import { useCart, useDismissCartNotices, useQuote, type CartIdentity } from '../queries'
import { CART_TABLE_GRID, CartLine } from './CartLine'
import { CartSummary } from './CartSummary'

const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

const container = 'mx-auto flex w-full max-w-[1200px] flex-col px-4 md:px-6 xl:px-0'

/**
 * Cart (Figma "Desktop / Carrinho" and "Mobile / Carrinho"). Without data, a failed
 * load is the whole screen; with a cart already on screen, a failed refresh keeps the
 * items and says the refresh failed, and the summary stops presenting its values as
 * current until the cart is confirmed again.
 */
export function CartPage() {
  const { identity, cart, isPending, isError, isFetching, error, refetch } = useCart()
  const headingRef = useRef<HTMLHeadingElement>(null)
  // The error and its button go away on success: the focus goes back to the page title.
  const retry = () => {
    if (isFetching) return
    void refetch().then((result) => {
      if (result.isSuccess && (!document.activeElement || document.activeElement === document.body)) headingRef.current?.focus()
    })
  }

  return (
    <div className={cn(container, 'gap-6 pt-4 pb-12 md:pt-6 md:pb-16')}>
      <CartHeader headingRef={headingRef} />
      {isPending ? (
        <CartSkeleton />
      ) : !cart ? (
        <section role="alert" data-testid="cart-error" className="flex flex-col items-start gap-3 py-8">
          <h2 className="text-title-20 font-bold text-cream">Não foi possível carregar o carrinho</h2>
          <p className="text-body-14 text-text-secondary">{errorMessage(error)}</p>
          <button
            type="button"
            onClick={retry}
            className={cn('h-10 rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
          >
            Tentar novamente
          </button>
        </section>
      ) : (
        <>
          {isError ? (
            <div
              role="alert"
              data-testid="cart-refresh-error"
              className="flex flex-col items-start gap-3 rounded-[8px] border border-coral/60 bg-surface-raised p-4 md:flex-row md:items-center md:justify-between"
            >
              <p className="text-body-14 text-cream">
                Não foi possível atualizar o carrinho. Os itens abaixo podem estar desatualizados. {errorMessage(error)}
              </p>
              <button
                type="button"
                onClick={retry}
                aria-disabled={isFetching || undefined}
                className={cn(
                  'h-9 shrink-0 rounded-[6px] bg-brand px-3 text-body-14 font-bold text-ink hover:bg-brand-accent aria-disabled:opacity-60',
                  focusRing,
                )}
              >
                {isFetching ? 'Atualizando…' : 'Tentar novamente'}
              </button>
            </div>
          ) : null}
          <CartContent identity={identity} cart={cart} unconfirmed={isError} onRetryCart={retry} headingRef={headingRef} />
        </>
      )}
    </div>
  )
}

/** Mobile: back button and title (Figma "Screen Header"). Desktop: the breadcrumb; the title is for assistive tech. */
function CartHeader({ headingRef }: { headingRef: RefObject<HTMLHeadingElement | null> }) {
  const router = useRouter()
  return (
    <>
      <div className="relative flex h-[35px] items-center justify-center md:contents">
        <button
          type="button"
          aria-label="Voltar"
          onClick={() => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: '/' }))}
          className={cn(
            'absolute left-0 flex size-[35px] items-center justify-center rounded-full border border-border-field bg-surface-raised text-sand md:hidden',
            focusRing,
          )}
        >
          <Icon name="arrow-left" className="size-5" />
        </button>
        <h1 ref={headingRef} tabIndex={-1} className="text-title-20 font-bold text-cream outline-none md:sr-only">
          Carrinho de NFTs
        </h1>
      </div>
      <nav aria-label="Trilha de navegação" className="hidden md:block">
        <ol className="flex gap-1 text-body-15 font-bold text-cream">
          <li>
            <Link to="/" className={cn('rounded-sm hover:text-brand-accent', focusRing)}>
              Início
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/" hash="catalogo" className={cn('rounded-sm hover:text-brand-accent', focusRing)}>
              Mercado
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Carrinho</li>
        </ol>
      </nav>
    </>
  )
}

/**
 * Keeps the keyboard focus when a line leaves the list (removed by the user, or by the
 * server because it sold out) while the focus was inside it: it moves to the remove
 * button of the next line, else of the previous one, else to the empty state. Focus
 * that is elsewhere is never taken.
 */
function useFocusAfterLineRemoval(ids: string[]) {
  const removeButtons = useRef(new Map<string, HTMLButtonElement>())
  const emptyHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusedLine = useRef<string | null>(null)
  const committedIds = useRef(ids)

  useLayoutEffect(() => {
    const previous = committedIds.current
    committedIds.current = ids
    const lost = focusedLine.current
    if (!lost || ids.includes(lost) || !previous.includes(lost)) return
    focusedLine.current = null
    if (document.activeElement && document.activeElement !== document.body) return
    const index = previous.indexOf(lost)
    const neighbour =
      previous.slice(index + 1).find((id) => ids.includes(id)) ?? previous.slice(0, index).reverse().find((id) => ids.includes(id))
    ;(neighbour ? removeButtons.current.get(neighbour) : emptyHeadingRef.current)?.focus()
  })

  return {
    emptyHeadingRef,
    trackFocus: (event: FocusEvent<HTMLElement>) => {
      focusedLine.current = (event.target as HTMLElement).closest('[data-item-id]')?.getAttribute('data-item-id') ?? null
    },
    removeButtonRef: (id: string) => (element: HTMLButtonElement | null) => {
      if (element) removeButtons.current.set(id, element)
      else removeButtons.current.delete(id)
    },
  }
}

function CartContent({
  identity,
  cart,
  unconfirmed,
  onRetryCart,
  headingRef,
}: {
  identity: CartIdentity
  cart: Cart
  unconfirmed: boolean
  onRetryCart: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const quote = useQuote(identity, cart)
  const empty = cart.items.length === 0
  const { emptyHeadingRef, trackFocus, removeButtonRef } = useFocusAfterLineRemoval(cart.items.map((item) => item.id))

  return (
    <>
      <CartNotices cart={cart} headingRef={headingRef} />
      {empty ? (
        <section data-testid="cart-empty" className="flex flex-col items-start gap-4 rounded-[16px] bg-surface-card p-6 md:p-8">
          <h2 ref={emptyHeadingRef} tabIndex={-1} className={cn('rounded-sm text-title-20 font-bold text-cream', focusRing)}>
            Seu carrinho está vazio
          </h2>
          <p className="text-body-14 text-text-secondary">Explore o mercado e adicione as edições que você quer colecionar.</p>
          <Link
            to="/"
            hash="catalogo"
            className={cn('flex h-10 items-center rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink hover:bg-brand-accent', focusRing)}
          >
            Explorar NFTs
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <section aria-labelledby="cart-items-title" className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-[782px]">
            <h2 id="cart-items-title" className="sr-only">
              Itens do carrinho ({cart.itemCount} {cart.itemCount === 1 ? 'unidade' : 'unidades'})
            </h2>
            <div aria-hidden="true" className={cn('hidden pb-3 text-body-16 text-cream md:grid', CART_TABLE_GRID)}>
              <span className="font-bold">NFTs</span>
              <span className="font-medium">Preço</span>
              <span className="font-bold">Edições</span>
              <span className="font-medium">Total</span>
              <span />
            </div>
            <div aria-hidden="true" className="-mt-3 hidden h-px bg-brand md:block" />
            <ul aria-label="Itens do carrinho" onFocus={trackFocus} className="flex flex-col gap-5 md:gap-3">
              {cart.items.map((item) => (
                <CartLine
                  key={item.id}
                  item={item}
                  quoteLine={quote.isSuccess && !unconfirmed ? quote.data.lines.find((line) => line.itemId === item.id) : undefined}
                  removeButtonRef={removeButtonRef(item.id)}
                />
              ))}
            </ul>
          </section>
          <CartSummary cart={cart} quote={quote} unconfirmed={unconfirmed} onRetryCart={onRetryCart} />
        </div>
      )}
      {empty ? null : <AlsoSeen nftId={cart.items[0].nft.id} />}
    </>
  )
}

/**
 * Changes the server made on its own (merge on sign-in, price, stock, expired coupon).
 * They stay until dismissed, so a refresh does not hide them; the announcer already
 * read them out when they appeared.
 */
function CartNotices({ cart, headingRef }: { cart: Cart; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const dismiss = useDismissCartNotices()
  if (cart.notices.length === 0) return null

  // The section (and its button) disappears: the focus goes back to the page title.
  function acknowledge() {
    if (dismiss.isPending) return
    dismiss.mutate(undefined, {
      onSuccess: () => {
        if (!document.activeElement || document.activeElement === document.body) headingRef.current?.focus()
      },
    })
  }
  return (
    <section
      aria-labelledby="cart-notices-title"
      data-testid="cart-notices"
      className="flex flex-col gap-3 rounded-[8px] border border-brand/60 bg-surface-raised p-4"
    >
      <h2 id="cart-notices-title" className="text-body-15 font-bold text-brand-accent">
        Mudanças no seu carrinho
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-body-14 text-cream">
        {cart.notices.map((notice) => (
          <li key={notice.id} data-kind={notice.kind}>
            {notice.message}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={acknowledge}
        aria-disabled={dismiss.isPending || undefined}
        className={cn('h-9 self-start rounded-[6px] border border-brand px-3 text-body-14 font-medium text-cream aria-disabled:opacity-60', focusRing)}
      >
        Entendi
      </button>
      {dismiss.error ? (
        <p role="alert" className="text-caption-13 text-coral">
          {errorMessage(dismiss.error)}
        </p>
      ) : null}
    </section>
  )
}

function AlsoSeen({ nftId }: { nftId: string }) {
  const recommended = useRecommendedNfts(nftId)
  return (
    <div className="mt-6 md:mt-16">
      <NftCarousel
        title="Colecionadores também viram"
        testId="recommendations-carousel"
        items={recommended.data}
        isPending={recommended.isPending}
        error={recommended.error}
        onRetry={() => void recommended.refetch()}
        emptyMessage="Ainda não há recomendações para os itens do carrinho."
      />
    </div>
  )
}

function CartSkeleton() {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-12" data-testid="cart-skeleton">
      <p role="status" className="sr-only">
        Carregando carrinho…
      </p>
      <div className="flex flex-1 flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-[100px] w-full rounded-[14px] md:h-[70px] md:rounded-none" />
        ))}
      </div>
      <Skeleton className="h-[320px] w-full lg:w-[332px]" />
    </div>
  )
}
