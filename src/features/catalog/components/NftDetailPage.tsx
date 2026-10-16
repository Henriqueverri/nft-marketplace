import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Edition, NftDetail } from '@/contracts/catalog'
import { useAddToCart } from '@/features/cart/queries'
import { FavoriteButton } from '@/features/favorites/FavoriteButton'
import { formatEthDisplay } from '@/lib/eth'
import { cn } from '@/lib/utils'
import { ApiError } from '@/shared/api/errors'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { errorMessage } from '@/shared/forms/form-errors'
import { Icon } from '@/shared/ui/Icon'
import { useNftDetail, useRecommendedNfts, useRelatedNfts, useReviews } from '../queries'
import { NftCarousel } from './NftCarousel'
import { NftGallery } from './NftGallery'
import { defaultEdition, maxQuantity } from '../editions'
import { EditionPicker, QuantityStepper } from './NftPurchase'

/** NFT detail (Figma "Desktop / Detalhes do NFT" and "Mobile / Detalhes do NFT"). */
export function NftDetailPage({ nftId }: { nftId: string }) {
  const detail = useNftDetail(nftId)

  if (detail.isPending) return <DetailSkeleton />
  if (detail.isError) {
    if (detail.error instanceof ApiError && detail.error.code === 'NOT_FOUND') return <NftNotFound />
    return (
      <section role="alert" className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-3 px-4 py-12 md:px-6 xl:px-0">
        <h1 className="text-heading-24 font-bold text-cream">Não foi possível carregar este NFT</h1>
        <p className="text-body-14 text-text-secondary">{errorMessage(detail.error)}</p>
        <button
          type="button"
          onClick={() => void detail.refetch()}
          className="h-10 rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          Tentar novamente
        </button>
      </section>
    )
  }
  // Keyed by NFT: moving to another NFT starts with its own edition and quantity.
  return <NftDetailContent key={detail.data.id} nft={detail.data} />
}

function NftDetailContent({ nft }: { nft: NftDetail }) {
  const [editionId, setEditionId] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState('details')
  const announce = useAnnounce()
  const navigate = useNavigate()
  const addToCart = useAddToCart()

  const edition: Edition = nft.editions.find((candidate) => candidate.id === editionId) ?? defaultEdition(nft)
  const max = maxQuantity(edition)
  const effectiveQuantity = Math.min(Math.max(quantity, 1), Math.max(max, 1))
  const soldOut = edition.available === 0
  const addError =
    addToCart.error && !(addToCart.error instanceof ApiError && addToCart.error.code === 'SESSION_CHANGED')
      ? addToCart.error
      : null

  function selectEdition(next: Edition) {
    setEditionId(next.id)
    addToCart.reset()
  }

  function changeQuantity(next: number) {
    setQuantity(next)
    addToCart.reset()
  }

  /** "Comprar" adds the selection and opens the cart; the cart button only adds. */
  function handleAdd(openCart: boolean) {
    addToCart.mutate(
      { nftId: nft.id, editionId: edition.id, quantity: effectiveQuantity },
      {
        onSuccess: () => {
          if (openCart) {
            void navigate({ to: '/cart' })
            return
          }
          announce(`${effectiveQuantity} × ${nft.name} (edição ${edition.name}) adicionado ao carrinho.`)
        },
        // Also announced: on mobile the inline message may be behind the buy bar.
        onError: (error) => {
          if (!(error instanceof ApiError && error.code === 'SESSION_CHANGED')) {
            announce(`Não foi possível adicionar ao carrinho. ${errorMessage(error)}`)
          }
        },
      },
    )
  }

  function showReviews() {
    setTab('reviews')
    document.getElementById('nft-tabs')?.scrollIntoView({ block: 'start' })
  }

  return (
    <article className="mx-auto flex w-full max-w-[1200px] flex-col gap-12 px-4 pt-4 pb-12 md:gap-16 md:px-6 md:pt-6 md:pb-16 xl:px-0">
      <div className="flex flex-col gap-4">
        <MobileTopActions nft={nft} />
        <nav aria-label="Trilha de navegação" className="hidden md:block">
          <ol className="flex gap-1 text-body-15 font-bold text-cream">
            <li>
              <Link to="/" className="rounded-sm outline-none hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring">
                Início
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                to="/"
                hash="catalogo"
                className="rounded-sm outline-none hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                Mercado
              </Link>
            </li>
          </ol>
        </nav>

        <div className="flex flex-col gap-6 md:flex-row md:gap-8 lg:gap-12">
          <NftGallery nft={nft} />

          <div className="-mx-4 flex flex-1 flex-col gap-4 rounded-t-[31px] bg-surface-card px-6 pt-6 pb-6 md:mx-0 md:rounded-none md:bg-transparent md:p-0">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-title-20 font-bold text-cream md:text-heading-28">{nft.name}</h1>
              <button
                type="button"
                onClick={showReviews}
                className="flex shrink-0 items-center gap-1 rounded-full border border-brand px-2 py-1 text-body-14 font-bold text-cream outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
                aria-label={`Nota média ${nft.rating.average.toFixed(1).replace('.', ',')} de 5, ${nft.rating.count} avaliações. Ver avaliações`}
              >
                <Icon name="star" className="size-4 text-brand-accent" />
                {nft.rating.average.toFixed(1)}
                <span className="font-normal text-text-secondary">({nft.rating.count})</span>
              </button>
            </div>

            <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
              <p className="text-title-22 font-bold text-brand-accent" data-testid="nft-detail-price">
                {formatEthDisplay(edition.priceEth)} ETH
              </p>
              <button
                type="button"
                onClick={showReviews}
                className="flex items-center gap-2 rounded-sm text-body-15 text-cream outline-none hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Stars average={nft.rating.average} />
                {nft.rating.count === 1 ? '1 avaliação de colecionador' : `${nft.rating.count} avaliações de colecionadores`}
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="hidden text-body-15 font-bold text-cream md:block">Sobre este NFT:</h2>
              <p className="text-body-14 leading-6 text-text-secondary">{nft.description}</p>
            </div>

            <EditionPicker nft={nft} selected={edition} onSelect={selectEdition} />

            <div className="hidden flex-wrap items-center gap-x-8 gap-y-4 md:flex">
              <QuantityStepper value={effectiveQuantity} max={max} onChange={changeQuantity} />
              <div className="flex flex-wrap gap-3">
                <BuyButton
                  soldOut={soldOut}
                  pending={addToCart.isPending}
                  onBuy={() => handleAdd(true)}
                  className="h-10 w-[130px] rounded-[6px] text-body-14"
                >
                  COMPRAR
                </BuyButton>
                <FavoriteButton nft={nft} variant="labeled" className="w-[130px]" />
              </div>
            </div>
            {addError ? (
              <p data-testid="add-to-cart-error" className="rounded-[6px] border border-coral/60 p-3 text-body-14 text-cream">
                Não foi possível adicionar ao carrinho. {errorMessage(addError)}
              </p>
            ) : soldOut ? (
              <p className="text-body-14 text-coral">Esta edição está esgotada. Escolha outra edição.</p>
            ) : null}

            <dl className="flex flex-col gap-2 text-body-15 text-sand">
              <div className="flex gap-1">
                <dt>ID do token:</dt>
                <dd>#{nft.tokenId.padStart(4, '0')}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Coleção:</dt>
                <dd>{nft.collection.name}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Atributos:</dt>
                <dd>{nft.attributes.join(', ')}</dd>
              </div>
            </dl>
            <ShareLinks nft={nft} />
          </div>
        </div>
      </div>

      <NftTabs nft={nft} tab={tab} onTabChange={setTab} />
      <RelatedCarousels nft={nft} />

      <MobileBuyBar
        edition={edition}
        quantity={effectiveQuantity}
        max={max}
        soldOut={soldOut}
        pending={addToCart.isPending}
        onQuantityChange={changeQuantity}
        onBuy={() => handleAdd(true)}
        onAdd={() => handleAdd(false)}
      />
    </article>
  )
}

function BuyButton({
  soldOut,
  pending,
  onBuy,
  className,
  children,
}: {
  soldOut: boolean
  pending: boolean
  onBuy: () => void
  className: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={soldOut || pending}
      aria-busy={pending || undefined}
      onClick={onBuy}
      className={cn(
        'flex items-center justify-center bg-brand font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:opacity-50',
        className,
      )}
    >
      {soldOut ? 'Esgotado' : children}
    </button>
  )
}

function Stars({ average }: { average: number }) {
  const filled = Math.round(average)
  return (
    <span className="flex gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <Icon key={index} name="star" className={cn('size-[15px]', index < filled ? 'text-brand-accent' : 'text-border-field')} />
      ))}
    </span>
  )
}

function MobileTopActions({ nft }: { nft: NftDetail }) {
  const router = useRouter()
  return (
    <div className="flex items-center justify-between md:hidden">
      <button
        type="button"
        aria-label="Voltar"
        onClick={() => (window.history.length > 1 ? router.history.back() : void router.navigate({ to: '/' }))}
        className="flex size-[35px] items-center justify-center rounded-full border border-border-field bg-surface-raised text-cream outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon name="arrow-left" className="size-5" />
      </button>
      <FavoriteButton nft={nft} variant="icon" className="size-[35px]" />
    </div>
  )
}

function ShareLinks({ nft }: { nft: NftDetail }) {
  const announce = useAnnounce()
  const url = window.location.href
  const text = `${nft.name} na Kurio`
  const linkClass = 'flex size-8 items-center justify-center rounded-sm text-cream outline-none hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      announce('Link do NFT copiado.')
    } catch {
      announce('Não foi possível copiar o link. Copie o endereço da barra do navegador.')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <p className="text-body-15 font-bold text-cream">Compartilhar este NFT:</p>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Compartilhar no LinkedIn (abre em nova aba)"
        className={linkClass}
      >
        <Icon name="share-linkedin" className="size-[15px]" />
      </a>
      <button type="button" onClick={() => void copyLink()} aria-label="Copiar link do NFT" className={linkClass}>
        <Icon name="share-message" className="size-[18px]" />
      </button>
      <a
        href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Compartilhar no X (abre em nova aba)"
        className={linkClass}
      >
        <Icon name="share-twitter" className="size-4" />
      </a>
    </div>
  )
}

function NftTabs({ nft, tab, onTabChange }: { nft: NftDetail; tab: string; onTabChange: (tab: string) => void }) {
  const reviews = useReviews(nft.id, tab === 'reviews')
  const shortAddress = `${nft.contractAddress.slice(0, 6).toUpperCase().replace('0X', '0x')}...${nft.contractAddress.slice(-4).toUpperCase()}`

  return (
    <Tabs id="nft-tabs" value={tab} onValueChange={onTabChange} className="scroll-mt-6 gap-6">
      <TabsList variant="line">
        <TabsTrigger value="details">Detalhes do NFT</TabsTrigger>
        <TabsTrigger value="reviews">Avaliações de colecionadores ({nft.rating.count})</TabsTrigger>
      </TabsList>
      <TabsContent value="details" className="flex flex-col gap-4 text-body-14 leading-6 text-text-secondary">
        <p>{nft.description}</p>
        <p>
          A propriedade inclui a arte em alta resolução, lançamentos exclusivos para colecionadores e um registro
          permanente de procedência na rede.
        </p>
        <div>
          <h2 className="font-bold text-cream">Rede:</h2>
          <p>Cunhado na {nft.network.name} com procedência imutável e metadados armazenados no IPFS.</p>
        </div>
        <div>
          <h2 className="font-bold text-cream">Contrato:</h2>
          <p>{shortAddress} • Contrato inteligente ERC-721 verificado.</p>
        </div>
        <div>
          <h2 className="font-bold text-cream">Direitos autorais:</h2>
          <p>
            Direitos autorais do criador: {nft.royaltyPercent}% nas vendas secundárias, pagos automaticamente pelos
            mercados compatíveis.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="reviews" className="text-body-14 text-text-secondary">
        {reviews.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <span className="sr-only">Carregando avaliações…</span>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : reviews.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3">
            <p>Não foi possível carregar as avaliações. {errorMessage(reviews.error)}</p>
            <button
              type="button"
              onClick={() => void reviews.refetch()}
              className="h-9 rounded-[6px] bg-brand px-3 font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Tentar novamente
            </button>
          </div>
        ) : reviews.data.length === 0 ? (
          <p>Este NFT ainda não recebeu avaliações.</p>
        ) : (
          <ul className="flex flex-col gap-4" aria-label="Avaliações">
            {reviews.data.map((review) => (
              <li key={review.id} className="flex flex-col gap-1 rounded-[8px] bg-surface-card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-bold text-cream">@{review.authorUsername}</span>
                  <span className="sr-only">Nota {review.rating} de 5</span>
                  <Stars average={review.rating} />
                  <time dateTime={review.createdAt} className="text-caption-12 text-sand">
                    {new Date(review.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </time>
                </div>
                <p>{review.comment}</p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  )
}

function RelatedCarousels({ nft }: { nft: NftDetail }) {
  const related = useRelatedNfts(nft.id)
  const recommended = useRecommendedNfts(nft.id)
  return (
    <>
      <NftCarousel
        title="Mais desta coleção"
        testId="related-carousel"
        items={related.data}
        isPending={related.isPending}
        error={related.error}
        onRetry={() => void related.refetch()}
        emptyMessage="Não há outros NFTs desta coleção no momento."
      />
      <NftCarousel
        title="Colecionadores também viram"
        testId="recommendations-carousel"
        items={recommended.data}
        isPending={recommended.isPending}
        error={recommended.error}
        onRetry={() => void recommended.refetch()}
        emptyMessage="Ainda não há recomendações para este NFT."
      />
    </>
  )
}

function MobileBuyBar({
  edition,
  quantity,
  max,
  soldOut,
  pending,
  onQuantityChange,
  onBuy,
  onAdd,
}: {
  edition: Edition
  quantity: number
  max: number
  soldOut: boolean
  pending: boolean
  onQuantityChange: (value: number) => void
  onBuy: () => void
  onAdd: () => void
}) {
  return (
    <div
      role="region"
      aria-label="Compra"
      className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-4 rounded-t-[40px] bg-surface-card px-6 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(10_6_4/0.45)] md:hidden"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-body-16 font-bold text-cream" aria-hidden="true">
            Qtd.
          </span>
          <QuantityStepper value={quantity} max={max} onChange={onQuantityChange} size="small" />
        </div>
        <p className="text-title-20 font-bold text-brand-accent" data-testid="nft-mobile-price">
          {formatEthDisplay(edition.priceEth)} ETH
        </p>
      </div>
      <div className="flex items-center gap-3">
        <BuyButton
          soldOut={soldOut}
          pending={pending}
          onBuy={onBuy}
          className="h-[60px] flex-1 rounded-[40px] bg-linear-to-r from-brand to-brand-accent text-body-16"
        >
          Comprar NFT
        </BuyButton>
        <button
          type="button"
          onClick={onAdd}
          disabled={soldOut || pending}
          aria-label="Adicionar ao carrinho"
          className="flex size-[60px] items-center justify-center rounded-full border border-border-field bg-surface-raised text-brand-accent outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Icon name="cart" className="size-6" />
        </button>
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pt-6 md:flex-row md:px-6 xl:px-0" data-testid="nft-detail-skeleton">
      <p role="status" className="sr-only">
        Carregando NFT…
      </p>
      <Skeleton className="aspect-square w-full max-w-[444px] rounded-[24px]" />
      <div className="flex flex-1 flex-col gap-4">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-7 w-1/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    </div>
  )
}

function NftNotFound() {
  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-4 px-4 py-16 md:px-6 xl:px-0">
      <p className="text-caption-13 font-medium tracking-widest text-brand-accent">ERRO 404</p>
      <h1 className="text-heading-28 font-bold text-cream">NFT não encontrado</h1>
      <p className="text-body-14 text-text-secondary">
        Este NFT não existe ou foi removido do catálogo. Explore outras obras no mercado.
      </p>
      <Link
        to="/"
        className="flex h-10 items-center rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        Voltar ao catálogo
      </Link>
    </section>
  )
}
