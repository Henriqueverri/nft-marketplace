import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { AccountShell } from '@/features/account/AccountShell'
import { useAuthenticatedUser } from '@/features/auth/authenticated-user'
import { CardGridSkeleton } from '@/features/catalog/components/CatalogSection'
import { NftCard } from '@/features/catalog/components/NftCard'
import { errorMessage } from '@/shared/forms/form-errors'
import { useFavorites } from './queries'

const CARD_SIZES = '(min-width: 1024px) 270px, (min-width: 768px) 30vw, 45vw'

/** "Lista de interesse" of the signed-in user (private route). */
export function FavoritesPage() {
  const user = useAuthenticatedUser()
  const favorites = useFavorites()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const count = favorites.data?.length

  // Removing a favorite unmounts its card (and the focused button with it): focus
  // returns to the page heading instead of being lost.
  const previousCount = useRef(count)
  useEffect(() => {
    const removed = previousCount.current !== undefined && count !== undefined && count < previousCount.current
    previousCount.current = count
    if (removed && document.activeElement === document.body) headingRef.current?.focus()
  }, [count])

  return (
    <AccountShell>
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          {/* Desktop title; on mobile AccountShell owns the h1 (Screen Header). */}
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="rounded-sm text-heading-28 font-bold text-cream outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:sr-only"
          >
            Lista de interesse
          </h1>
          <p role="status" data-testid="favorites-status" className="text-body-14 text-text-secondary">
            {favorites.isPending
              ? 'Carregando sua lista…'
              : favorites.isError && !favorites.data
                ? 'Não foi possível carregar sua lista.'
                : count === 1
                  ? `1 NFT salvo por ${user.displayName}`
                  : `${count} NFTs salvos por ${user.displayName}`}
          </p>
        </div>

        {favorites.isPending ? (
          <CardGridSkeleton count={4} className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-8 lg:grid-cols-4" />
        ) : !favorites.data ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-[8px] bg-surface-card p-6">
            <p className="text-body-16 font-bold text-cream">Não foi possível carregar sua lista de interesse.</p>
            <p className="text-body-14 text-text-secondary">{errorMessage(favorites.error)}</p>
            <button
              type="button"
              onClick={() => void favorites.refetch()}
              className="h-10 rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Tentar novamente
            </button>
          </div>
        ) : favorites.data.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-[8px] bg-surface-card p-6" data-testid="favorites-empty">
            <p className="text-body-16 font-bold text-cream">Sua lista de interesse está vazia.</p>
            <p className="text-body-14 text-text-secondary">
              Toque no coração de um NFT para guardá-lo aqui e acompanhar o preço.
            </p>
            <Link
              to="/"
              hash="catalogo"
              className="flex h-10 items-center rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              Explorar o mercado
            </Link>
          </div>
        ) : (
          <ul aria-label="NFTs salvos" className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-8 lg:grid-cols-4">
            {favorites.data.map((favorite) => (
              <li key={favorite.nft.id}>
                <NftCard nft={favorite.nft} sizes={CARD_SIZES} headingLevel="h2" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AccountShell>
  )
}
