import { useState } from 'react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Nft } from '@/contracts/catalog'
import { cn } from '@/lib/utils'
import { Icon } from '@/shared/ui/Icon'
import { NftArtwork } from '../artwork'

/**
 * The Figma gallery shows four thumbnails of one artwork. Each NFT has a single
 * artwork, so the views are framings of it (full piece and details), not invented
 * images.
 */
const views = [
  { label: 'Obra completa', transform: 'none' },
  { label: 'Detalhe do rosto', transform: 'scale(1.7) translateY(8%)' },
  { label: 'Detalhe do acessório', transform: 'scale(2.1) translateY(-14%)' },
  { label: 'Detalhe do fundo', transform: 'scale(1.35) translate(12%, 10%)' },
] as const

export function NftGallery({ nft }: { nft: Nft }) {
  const [selected, setSelected] = useState(0)
  const view = views[selected]

  return (
    <div className="flex gap-4 md:shrink-0 md:basis-1/2 lg:basis-[560px]">
      <ul aria-label="Vistas da obra" className="hidden w-[100px] shrink-0 flex-col gap-4 md:flex">
        {views.map((item, index) => (
          <li key={item.label}>
            <button
              type="button"
              aria-label={item.label}
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
              className={cn(
                'block size-[100px] overflow-hidden rounded-[8px] border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink',
                index === selected ? 'border-brand' : 'border-transparent hover:border-border-field',
              )}
            >
              <span className="block size-full overflow-hidden">
                <NftArtwork
                  imageKey={nft.imageKey}
                  alt=""
                  sizes="100px"
                  className="size-full"
                  style={{ transform: item.transform }}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="relative w-full max-w-[444px] min-w-0 flex-1 rounded-[24px] bg-surface-card md:rounded-[6px] md:p-4">
        <div className="overflow-hidden rounded-[24px]">
          <NftArtwork
            imageKey={nft.imageKey}
            alt={`${nft.name} — ${view.label.toLowerCase()}`}
            sizes="(min-width: 768px) 412px, 92vw"
            priority
            className="w-full transition-transform duration-300"
            style={{ transform: view.transform }}
          />
        </div>
        <ZoomDialog nft={nft} />
      </div>
    </div>
  )
}

function ZoomDialog({ nft }: { nft: Nft }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Ampliar imagem"
          className="absolute top-3 right-3 flex size-[30px] items-center justify-center rounded-full border border-border-field bg-surface-raised text-cream outline-none hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring md:top-6 md:right-6"
        >
          <Icon name="zoom" className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/80"
        className="w-[min(92vw,720px)] max-w-none gap-3 bg-surface-card p-4 sm:max-w-none"
      >
        <div className="flex items-center justify-between gap-4">
          <DialogTitle className="text-body-16 font-bold text-cream">{nft.name}</DialogTitle>
          <DialogClose className="flex size-9 items-center justify-center rounded-full text-cream outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring">
            <Icon name="close" className="size-[18px]" />
            <span className="sr-only">Fechar</span>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">Imagem ampliada da obra.</DialogDescription>
        <NftArtwork imageKey={nft.imageKey} alt={nft.name} sizes="(min-width: 768px) 720px, 92vw" className="w-full rounded-[16px]" />
      </DialogContent>
    </Dialog>
  )
}
