import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import type { Nft } from '@/contracts/catalog'
import { NftArtwork } from '@/features/catalog/artwork'
import { useFeatured } from '@/features/catalog/queries'
import { cn } from '@/lib/utils'
import { Icon } from '@/shared/ui/Icon'

/**
 * Hero of the home (Figma "Hero"). The copy is fixed; the artwork rotates through the
 * featured NFTs only when the user picks a slide (no autoplay).
 */
export function HeroCarousel() {
  const featured = useFeatured()
  const slides = featured.data?.slides ?? []
  const [index, setIndex] = useState(0)
  const current: Nft | undefined = slides[Math.min(index, slides.length - 1)]

  return (
    <section aria-label="Destaques da Kurio" className="relative">
      {/* Mobile banner (Figma 14:5226). Each layout has its own h1; only one is ever displayed. */}
      <div className="relative flex min-h-[190px] overflow-hidden rounded-[12px] bg-linear-to-br from-surface-raised to-surface-card p-4 md:hidden">
        <div className="relative z-10 flex w-[58%] flex-col gap-2">
          <p className="text-caption-13 font-medium text-cream">Bem-vindo à Kurio</p>
          <h1 className="text-title-20 font-bold tracking-wide text-cream uppercase">Seja dono da cultura digital</h1>
          <p className="text-caption-13 text-text-secondary">Descubra NFTs selecionados de criadores do mundo todo.</p>
          <ExploreLink className="mt-auto inline-flex items-center gap-2 text-body-14 font-bold text-brand-accent">
            EXPLORAR <Icon name="arrow-right" className="size-4" />
          </ExploreLink>
        </div>
        <div className="absolute top-3 right-3 bottom-8 flex w-[38%] items-center justify-end">
          {current ? (
            <SlideImage nft={current} sizes="40vw" className="w-full rounded-[12px]" priority={index === 0} />
          ) : (
            <Skeleton className="aspect-square w-full rounded-[12px]" />
          )}
        </div>
        <Dots slides={slides} index={index} onSelect={setIndex} className="absolute right-3 bottom-1 w-[38%] justify-center" />
      </div>

      {/* Desktop hero (Figma 2:2) */}
      <div className="hidden items-center justify-between gap-10 md:flex">
        <div className="flex max-w-[560px] flex-col gap-5">
          <p className="text-body-14 font-medium text-cream">Bem-vindo à Kurio</p>
          <h1 className="text-heading-28 leading-[1.4] font-bold text-cream uppercase lg:text-display-43 lg:leading-[70px]">
            Seja dono do futuro <br />
            da arte digital
          </h1>
          <p className="text-body-14 leading-6 text-text-secondary">
            Descubra NFTs selecionados de criadores emergentes e consagrados. Colecione arte digital rara, apoie
            artistas e tenha uma parte da cultura da internet.
          </p>
          <ExploreLink className="flex h-10 w-[140px] items-center justify-center rounded-[6px] bg-brand text-body-16 font-bold text-ink hover:bg-brand-accent">
            EXPLORAR
          </ExploreLink>
        </div>
        <div className="flex w-[clamp(280px,40vw,450px)] shrink-0 flex-col items-center gap-4">
          {current ? (
            <SlideImage nft={current} sizes="(min-width: 1024px) 450px, 40vw" className="w-full rounded-[24px]" priority={index === 0} />
          ) : (
            <Skeleton className="aspect-square w-full rounded-[24px]" />
          )}
          <Dots slides={slides} index={index} onSelect={setIndex} />
        </div>
      </div>
      {featured.isError ? (
        <p className="sr-only" role="status">
          Não foi possível carregar os destaques.
        </p>
      ) : null}
    </section>
  )
}

function ExploreLink({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <a
      href="#catalogo"
      className={cn('rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink', className)}
    >
      {children}
    </a>
  )
}

function SlideImage({ nft, sizes, className, priority }: { nft: Nft; sizes: string; className: string; priority: boolean }) {
  return (
    <Link
      to="/nfts/$nftId"
      params={{ nftId: nft.id }}
      className="block w-full rounded-[24px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <NftArtwork imageKey={nft.imageKey} alt={`Destaque: ${nft.name}`} sizes={sizes} className={className} priority={priority} />
    </Link>
  )
}

function Dots({
  slides,
  index,
  onSelect,
  className,
}: {
  slides: Nft[]
  index: number
  onSelect: (index: number) => void
  className?: string
}) {
  // Keeps the row's height while the slides load, so the catalog below does not move.
  if (slides.length < 2) return <div aria-hidden="true" className={cn('h-6', className)} />
  return (
    <div role="group" aria-label="Destaques" className={cn('flex gap-1.5', className)}>
      {slides.map((slide, position) => (
        <button
          key={slide.id}
          type="button"
          aria-label={`Destaque ${position + 1} de ${slides.length}: ${slide.name}`}
          aria-pressed={position === index}
          onClick={() => onSelect(position)}
          className="flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', position === index ? 'bg-brand-accent' : 'bg-brand/40')}
          />
        </button>
      ))}
    </div>
  )
}
