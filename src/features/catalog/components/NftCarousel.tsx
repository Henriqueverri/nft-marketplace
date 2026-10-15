import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Nft } from '@/contracts/catalog'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/shared/forms/form-errors'
import { Icon } from '@/shared/ui/Icon'
import { NftCard } from './NftCard'

interface NftCarouselProps {
  title: string
  items: Nft[] | undefined
  isPending: boolean
  error: unknown
  onRetry: () => void
  emptyMessage: string
  testId: string
}

const CARD_SIZES = '(min-width: 1024px) 219px, (min-width: 768px) 28vw, 45vw'

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Horizontal list of cards (Figma "Mais desta coleção"). Native scrolling with snap
 * points; the previous/next buttons and the page dots move one visible page at a
 * time. Every card stays reachable with Tab, which scrolls it into view.
 */
export function NftCarousel({ title, items, isPending, error, onRetry, emptyMessage, testId }: NftCarouselProps) {
  const headingId = useId()
  const trackRef = useRef<HTMLUListElement>(null)
  const [position, setPosition] = useState({ page: 0, pages: 1 })

  const measure = useCallback(() => {
    const track = trackRef.current
    if (!track || track.clientWidth === 0) return
    const pages = Math.max(1, Math.ceil(track.scrollWidth / track.clientWidth - 0.05))
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4
    const page = atEnd ? pages - 1 : Math.round(track.scrollLeft / track.clientWidth)
    setPosition((current) => (current.page === page && current.pages === pages ? current : { page, pages }))
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    track.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      track.removeEventListener('scroll', measure)
    }
  }, [measure, items])

  function goTo(page: number) {
    const track = trackRef.current
    if (!track) return
    track.scrollTo({ left: page * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  const buttonClass =
    'flex size-9 items-center justify-center rounded-full border border-border-field text-cream outline-none hover:border-brand hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:hover:border-border-field disabled:hover:text-cream'

  return (
    <section
      aria-labelledby={headingId}
      aria-roledescription="carrossel"
      data-testid={testId}
      className="flex flex-col gap-6"
    >
      <div className="flex items-center justify-between gap-4 border-b border-brand/30 pb-3">
        <h2 id={headingId} className="text-body-18 font-bold text-brand-accent md:text-[17px]">
          {title}
        </h2>
        {items && items.length > 0 && position.pages > 1 ? (
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={`${title}: anteriores`}
              disabled={position.page === 0}
              onClick={() => goTo(position.page - 1)}
              className={buttonClass}
            >
              <Icon name="chevron-right" className="size-4 rotate-180" />
            </button>
            <button
              type="button"
              aria-label={`${title}: próximos`}
              disabled={position.page >= position.pages - 1}
              onClick={() => goTo(position.page + 1)}
              className={buttonClass}
            >
              <Icon name="chevron-right" className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      {isPending ? (
        <div aria-hidden="true" className="flex gap-4 overflow-hidden md:gap-6">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex w-[45%] shrink-0 flex-col gap-3 md:w-[calc((100%-4*1.5rem)/5)]">
              <Skeleton className="aspect-square w-full rounded-none" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
          <span className="sr-only">Carregando…</span>
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[8px] bg-surface-card p-4">
          <p className="text-body-14 text-text-secondary">
            Não foi possível carregar esta lista. {errorMessage(error)}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="h-9 rounded-[6px] bg-brand px-3 text-body-14 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            Tentar novamente
          </button>
        </div>
      ) : !items?.length ? (
        <p className="text-body-14 text-text-secondary">{emptyMessage}</p>
      ) : (
        <>
          <ul
            ref={trackRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] motion-reduce:scroll-auto md:gap-6 [&::-webkit-scrollbar]:hidden"
          >
            {items.map((nft) => (
              <li key={nft.id} className="w-[45%] shrink-0 snap-start md:w-[calc((100%-4*1.5rem)/5)]">
                <NftCard nft={nft} sizes={CARD_SIZES} />
              </li>
            ))}
          </ul>
          {position.pages > 1 ? (
            <div role="group" aria-label={`Páginas de ${title}`} className="flex justify-center gap-1">
              {Array.from({ length: position.pages }, (_, page) => (
                <button
                  key={page}
                  type="button"
                  aria-label={`Página ${page + 1} de ${position.pages}`}
                  aria-pressed={page === position.page}
                  onClick={() => goTo(page)}
                  className="flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-3 rounded-full border border-brand',
                      page === position.page ? 'bg-brand' : 'bg-transparent',
                    )}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
