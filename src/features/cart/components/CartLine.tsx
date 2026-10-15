import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import type { CartItem, QuoteLine } from '@/contracts/cart'
import { NftArtwork } from '@/features/catalog/artwork'
import { formatEthDisplay } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { errorMessage } from '@/shared/forms/form-errors'
import { ApiError } from '@/shared/api/errors'
import { Skeleton } from '@/components/ui/skeleton'
import { Icon } from '@/shared/ui/Icon'
import { useRemoveCartItem, useUpdateCartItem } from '../queries'

const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

/** Grid shared by the desktop column headers and the rows (Figma "Cart Table"). */
export const CART_TABLE_GRID = 'md:grid md:grid-cols-[minmax(0,1fr)_88px_76px_96px_24px] md:gap-x-8 md:pr-6'

/**
 * One line of the cart (Figma "Cart Item" on desktop, "Item" card on mobile). Every
 * change goes to the server; while it is in flight the line's controls are locked.
 * They are locked with aria-disabled, not disabled: a disabled button loses the
 * keyboard focus, so each step would send the user back to the top of the page. The
 * handlers ignore activations while locked. Line totals come only from the quote
 * (`quoteLine`); without a current quote they show as loading, never as a value
 * computed here.
 */
export function CartLine({
  item,
  quoteLine,
  removeButtonRef,
}: {
  item: CartItem
  quoteLine: QuoteLine | undefined
  removeButtonRef: (element: HTMLButtonElement | null) => void
}) {
  const update = useUpdateCartItem()
  const remove = useRemoveCartItem()
  const announce = useAnnounce()
  const limitId = useId()
  const pending = update.isPending || remove.isPending
  const error = [update.error, remove.error].find(
    (candidate) => candidate && !(candidate instanceof ApiError && candidate.code === 'SESSION_CHANGED'),
  )
  const atLimit = item.quantity >= item.maxQuantity
  const name = item.nft.name

  function changeQuantity(quantity: number) {
    if (pending) return
    remove.reset()
    update.mutate({ itemId: item.id, quantity })
  }

  function removeLine() {
    if (pending) return
    update.reset()
    remove.mutate(item.id, {
      onSuccess: () => announce(`${name} (edição ${item.edition.name}) removido do carrinho.`),
    })
  }

  const total = quoteLine ? (
    `${formatEthDisplay(quoteLine.lineTotalEth)} ETH`
  ) : (
    <>
      <span className="sr-only">Calculando…</span>
      <Skeleton aria-hidden="true" className="inline-block h-4 w-16 align-middle" />
    </>
  )

  return (
    <li
      data-testid="cart-item"
      data-item-id={item.id}
      aria-busy={pending || undefined}
      className={cn(
        'flex min-h-[100px] flex-wrap items-stretch rounded-[14px] bg-surface-card md:min-h-[70px] md:items-center md:rounded-none',
        CART_TABLE_GRID,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 md:order-1 md:gap-4">
        <NftArtwork
          imageKey={item.nft.imageKey}
          alt=""
          sizes="100px"
          className="size-[100px] shrink-0 rounded-[14px] md:size-[70px] md:rounded-[6px]"
        />
        <div className="flex min-w-0 flex-col gap-1 py-3 pr-2 md:py-0">
          <Link
            to="/nfts/$nftId"
            params={{ nftId: item.nft.id }}
            className={cn(
              'line-clamp-2 rounded-sm text-body-15 font-bold break-words text-cream hover:text-brand-accent md:line-clamp-1 md:text-body-16',
              focusRing,
            )}
          >
            {name}
          </Link>
          <p className="text-body-14 text-text-secondary md:truncate md:text-caption-12 md:text-sand">
            Edição: {item.edition.name}
            <span className="hidden md:inline"> · ID do token: #{item.nft.tokenId.padStart(4, '0')}</span>
          </p>
          <p data-testid="cart-item-total" className="mt-1 text-body-18 font-bold text-brand-accent md:hidden">
            {total}
          </p>
        </div>
      </div>

      <p className="sr-only md:not-sr-only md:order-2 md:text-body-16 md:font-bold md:text-text-secondary">
        <span className="sr-only">Preço unitário: </span>
        <span data-testid="cart-item-unit-price">{formatEthDisplay(item.unitPriceEth)} ETH</span>
      </p>

      <div className="flex flex-col items-end justify-between gap-2 py-3 pr-3 md:contents">
        <button
          ref={removeButtonRef}
          type="button"
          onClick={removeLine}
          aria-disabled={pending || undefined}
          aria-label={`Remover ${name} do carrinho`}
          className={cn(
            'relative flex size-6 items-center justify-center rounded-full text-brand aria-disabled:cursor-not-allowed aria-disabled:opacity-50 md:order-5 md:text-sand md:hover:text-brand-accent',
            'after:absolute after:-inset-2.5',
            focusRing,
          )}
        >
          <Icon name="delete" className="size-6" />
        </button>
        <div className="md:order-3">
          <div role="group" aria-label={`Quantidade de ${name}`} className="flex items-center gap-3">
            <StepButton
              label={`Diminuir quantidade de ${name}`}
              unavailable={pending || item.quantity <= 1}
              onClick={() => {
                if (item.quantity > 1) changeQuantity(item.quantity - 1)
              }}
              icon="minus"
            />
            <output
              aria-live="polite"
              aria-label={`Quantidade de ${name}`}
              data-testid="cart-item-quantity"
              className="min-w-4 text-center text-body-16 text-cream md:text-[17px]"
            >
              {item.quantity}
            </output>
            <StepButton
              label={`Aumentar quantidade de ${name}`}
              unavailable={pending || atLimit}
              describedBy={atLimit ? limitId : undefined}
              onClick={() => {
                if (!atLimit) changeQuantity(item.quantity + 1)
              }}
              icon="plus"
            />
          </div>
          {atLimit ? (
            <p id={limitId} className="mt-1 text-right text-caption-12 text-sand md:text-center" data-testid="cart-item-limit">
              Máx. {item.maxQuantity}
            </p>
          ) : null}
        </div>
      </div>

      <p className="hidden md:order-4 md:block md:text-body-16 md:font-bold md:text-brand-accent">
        <span className="sr-only">Total do item: </span>
        <span data-testid="cart-item-total">{total}</span>
      </p>

      {error ? (
        <p
          role="alert"
          className="basis-full px-3 pb-3 text-caption-13 text-coral md:order-6 md:col-span-5 md:px-0 md:pb-2"
        >
          {errorMessage(error)}
        </p>
      ) : null}
    </li>
  )
}

/**
 * Desktop: 20×30 brand pills (Figma "Add Button"). Mobile: 24 px circles; the touch
 * target is widened to 44 px by an invisible pseudo-element. An unavailable step
 * (pending change, or the limit reached) stays focusable and is announced as
 * unavailable; the caller's handler ignores it.
 */
function StepButton({
  label,
  unavailable,
  describedBy,
  onClick,
  icon,
}: {
  label: string
  unavailable: boolean
  describedBy?: string
  onClick: () => void
  icon: 'minus' | 'plus'
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={unavailable || undefined}
      aria-describedby={describedBy}
      onClick={onClick}
      className={cn(
        'relative flex size-6 items-center justify-center rounded-full border border-border-field bg-surface-raised text-cream aria-disabled:cursor-not-allowed aria-disabled:opacity-40',
        'md:h-[30px] md:w-5 md:border-ink md:bg-brand md:text-ink md:hover:bg-brand-accent md:aria-disabled:hover:bg-brand',
        'after:absolute after:-inset-2.5 md:after:-inset-x-3 md:after:-inset-y-1',
        focusRing,
      )}
    >
      <Icon name={icon} className="size-3" />
    </button>
  )
}
