import type { CSSProperties } from 'react'
import type { NftImageKey } from '@/contracts/catalog'
import { cn } from '@/lib/utils'

/** The four artworks of the Figma file, exported as WebP in three widths. */
const files = import.meta.glob<string>('/src/assets/nfts/*.webp', { eager: true, import: 'default' })

const WIDTHS = [320, 640, 960] as const

function sourcesOf(key: NftImageKey) {
  const urls = WIDTHS.map((width) => files[`/src/assets/nfts/${key}-${width}.webp`])
  return {
    src: urls[1],
    srcSet: urls.map((url, index) => `${url} ${WIDTHS[index]}w`).join(', '),
  }
}

interface NftArtworkProps {
  imageKey: NftImageKey
  /** Empty for decorative copies (the name is already next to the image). */
  alt: string
  /** CSS `sizes` of the rendered box, so the browser picks the right width. */
  sizes: string
  className?: string
  style?: CSSProperties
  /** Above-the-fold images (hero, detail) load first; the rest load lazily. */
  priority?: boolean
}

export function NftArtwork({ imageKey, alt, sizes, className, style, priority = false }: NftArtworkProps) {
  const { src, srcSet } = sourcesOf(imageKey)
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={sizes}
      alt={alt}
      width={640}
      height={640}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={cn('aspect-square object-cover', className)}
      style={style}
    />
  )
}
