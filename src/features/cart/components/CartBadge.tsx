import { cn } from '@/lib/utils'

/** Figma "Badge": 16 px brand dot with an ink ring, over the top-right of the cart icon. */
export function CartCountBadge({ count, className }: { count: number | null; className?: string }) {
  if (!count) return null
  return (
    <span
      aria-hidden="true"
      data-testid="cart-badge"
      className={cn(
        'absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full border border-ink bg-brand px-1 text-tiny-10 font-medium text-ink',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
