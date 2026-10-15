import { Link } from '@tanstack/react-router'
import type { Nft } from '@/contracts/catalog'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { formatEthDisplay } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { NftArtwork } from '../artwork'

interface NftCardProps {
  nft: Nft
  /** `sizes` of the artwork for the grid it is rendered in. */
  sizes: string
  headingLevel?: 'h2' | 'h3'
  /** For the first cards of a grid, which are in the first viewport (LCP candidates). */
  imagePriority?: boolean
  className?: string
}

/**
 * Catalog card (Figma "Card NFT"). The whole card opens the detail page through the
 * stretched name link; the favorite button sits above it as a separate control.
 */
export function NftCard({ nft, sizes, headingLevel: Heading = 'h3', imagePriority = false, className }: NftCardProps) {
  return (
    <article className={cn('group relative flex flex-col', className)} data-testid="nft-card" data-nft-id={nft.id}>
      <div className="relative bg-surface-card p-1">
        <NftArtwork
          imageKey={nft.imageKey}
          alt=""
          sizes={sizes}
          priority={imagePriority}
          className="w-full rounded-[15px] transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {nft.rarity === 'rare' ? (
          <span className="absolute top-1 left-1 rounded-tl-[15px] bg-brand px-2.5 py-1.5 text-caption-13 font-medium text-ink">
            RARO
          </span>
        ) : null}
      </div>
      <FavoriteButton nft={nft} variant="icon" className="absolute top-3 right-3 z-10" />
      <Heading className="mt-3 text-body-16 text-cream">
        <Link
          to="/nfts/$nftId"
          params={{ nftId: nft.id }}
          className="outline-none after:absolute after:inset-0 after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {nft.name}
        </Link>
      </Heading>
      <NftPrice nft={nft} className="mt-1" />
    </article>
  )
}

export function NftPrice({ nft, className }: { nft: Nft; className?: string }) {
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-2 text-body-18', className)}>
      <span className="font-bold text-brand-accent" data-testid="nft-price">
        {formatEthDisplay(nft.priceEth)} ETH
      </span>
      {nft.compareAtPriceEth ? (
        <span className="text-sand">
          <span className="sr-only">Preço anterior: </span>
          {formatEthDisplay(nft.compareAtPriceEth)} ETH
        </span>
      ) : null}
    </p>
  )
}
