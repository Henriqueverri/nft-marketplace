import { useLocation, useNavigate } from '@tanstack/react-router'
import type { Nft } from '@/contracts/catalog'
import { useSessionSnapshot } from '@/features/auth/queries'
import { cn } from '@/lib/utils'
import { Icon } from '@/shared/ui/Icon'
import { useFavoriteIds, useFavoritePending, useToggleFavorite } from './queries'

interface FavoriteButtonProps {
  nft: Nft
  /** `icon`: round button over artworks; `labeled`: "Favoritar" button of the detail page. */
  variant: 'icon' | 'labeled'
  className?: string
}

/**
 * Toggle button (aria-pressed). Visitors are sent to login and come back to the same
 * page. While a change of this NFT is being saved (from this or any other button)
 * the button ignores clicks but keeps focus.
 */
export function FavoriteButton({ nft, variant, className }: FavoriteButtonProps) {
  const { userId } = useSessionSnapshot()
  const { ids, ready } = useFavoriteIds()
  const toggle = useToggleFavorite(userId ?? '')
  const pending = useFavoritePending(userId, nft.id)
  const navigate = useNavigate()
  const href = useLocation({ select: (location) => location.href })
  const favorited = ids.has(nft.id)
  const busy = userId !== null && (!ready || pending)

  function handleClick() {
    if (!userId) {
      void navigate({ to: '/login', search: { redirect: href } })
      return
    }
    if (busy) return
    toggle.mutate({ nft, favorite: !favorited })
  }

  const icon = <Icon name={favorited ? 'heart-solid' : 'heart'} className={variant === 'icon' ? 'size-4' : 'size-5'} />

  if (variant === 'icon') {
    return (
      <button
        type="button"
        aria-pressed={favorited}
        aria-disabled={busy || undefined}
        aria-label={`Favoritar ${nft.name}`}
        onClick={handleClick}
        className={cn(
          'flex size-8 items-center justify-center rounded-full border border-border-field bg-surface-raised text-brand outline-none transition-colors hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring aria-pressed:text-brand-accent',
          className,
        )}
      >
        {icon}
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-pressed={favorited}
      aria-disabled={busy || undefined}
      onClick={handleClick}
      className={cn(
        'flex h-10 items-center justify-center gap-2 rounded-[6px] border border-brand px-4 text-body-14 font-medium text-cream outline-none transition-colors hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-surface-raised aria-pressed:text-brand-accent',
        className,
      )}
    >
      <span className="text-brand-accent">{icon}</span>
      Favoritar
    </button>
  )
}
