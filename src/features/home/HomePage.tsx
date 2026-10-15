import { Link } from '@tanstack/react-router'
import { Skeleton } from '@/components/ui/skeleton'
import type { NftImageKey } from '@/contracts/catalog'
import { NftArtwork } from '@/features/catalog/artwork'
import { CatalogSearchBar, CatalogSection } from '@/features/catalog/components/CatalogSection'
import { useFeatured } from '@/features/catalog/queries'
import { DEFAULT_CATALOG_SEARCH, type CatalogSearch } from '@/features/catalog/search-params'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { Icon } from '@/shared/ui/Icon'
import { HeroCarousel } from './HeroCarousel'

/** Home (Figma "Desktop / Início" and "Mobile / Início"). */
export function HomePage({ search }: { search: CatalogSearch }) {
  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-10 px-4 pt-6 pb-16 md:gap-16 md:px-6 md:pt-10 lg:gap-24 xl:px-0">
      <div className="flex flex-col gap-6">
        <CatalogSearchBar search={search} />
        <HeroCarousel />
      </div>
      <CatalogSection search={search} aside={<SpotlightBanner />} />
      <Promotions />
      <MintJournal />
    </div>
  )
}

function SpotlightBanner() {
  const featured = useFeatured()
  const nft = featured.data?.spotlight
  return (
    <section
      aria-label="NFT em destaque"
      className="relative overflow-hidden rounded-[22px] bg-linear-to-b from-brand/10 to-brand/3"
    >
      <div className="flex flex-col items-center gap-1 px-4 pt-5 pb-3 text-center">
        <p className="text-heading-24 font-bold text-brand-accent">NFT EM DESTAQUE</p>
        <p className="text-title-22 font-bold text-cream">OFERTA LIMITADA</p>
      </div>
      {nft ? (
        <Link
          to="/nfts/$nftId"
          params={{ nftId: nft.id }}
          className="block rounded-[22px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <NftArtwork imageKey={nft.imageKey} alt={`${nft.name}, oferta limitada`} sizes="310px" className="w-full rounded-[22px]" />
        </Link>
      ) : (
        <Skeleton className="aspect-square w-full rounded-[22px]" />
      )}
    </section>
  )
}

const promotions: { title: string; text: string; image: NftImageKey; search: CatalogSearch }[] = [
  {
    title: 'Lançamentos gênesis de edição limitada',
    text: 'Colecione edições escassas diretamente dos criadores antes da revelação pública.',
    image: 'ape-sunglasses',
    search: { ...DEFAULT_CATALOG_SEARCH, view: 'new' },
  },
  {
    title: 'Arte digital selecionada e muito mais',
    text: 'Explore novos artistas, coleções verificadas e obras digitais que definem a cultura.',
    image: 'gorilla-suit',
    search: { ...DEFAULT_CATALOG_SEARCH, collections: 'col_arte-digital' },
  },
]

function Promotions() {
  return (
    <section aria-label="Coleções em destaque" className="grid gap-6 md:grid-cols-2 lg:gap-7">
      {promotions.map((promo) => (
        <article key={promo.title} className="flex items-center gap-4 rounded-[8px] bg-surface-card p-3 lg:gap-6">
          <NftArtwork
            imageKey={promo.image}
            alt=""
            sizes="(min-width: 768px) 200px, 40vw"
            className="w-[42%] max-w-[226px] shrink-0 rounded-[8px]"
          />
          <div className="flex flex-col items-start gap-3">
            <h2 className="text-body-16 font-bold text-cream lg:text-body-18">{promo.title}</h2>
            <p className="text-caption-12 text-text-secondary lg:text-body-14">{promo.text}</p>
            <Link
              to="/"
              search={promo.search}
              hash="catalogo"
              aria-label={`Explorar: ${promo.title}`}
              className="inline-flex h-9 items-center gap-2 rounded-[6px] bg-brand px-3 text-body-14 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card"
            >
              Explorar <Icon name="arrow-right" className="size-4" />
            </Link>
          </div>
        </article>
      ))}
    </section>
  )
}

const articles: { title: string; text: string; meta: string; image: NftImageKey }[] = [
  {
    title: 'Como funciona a propriedade de NFTs',
    text: 'Aprenda a colecionar, negociar e verificar ativos digitais.',
    meta: '12 de setembro  |  Leitura de 6 min',
    image: 'gorilla-suit',
  },
  {
    title: '10 artistas digitais para acompanhar',
    text: 'Conheça criadores que moldam a cultura digital.',
    meta: '13 de setembro  |  Leitura de 2 min',
    image: 'ape-sunglasses',
  },
  {
    title: 'Raridade, atributos e procedência',
    text: 'Entenda raridade, procedência, direitos autorais e utilidade.',
    meta: '15 de setembro  |  Leitura de 3 min',
    image: 'gorilla-hat',
  },
  {
    title: 'Como proteger sua carteira',
    text: 'Proteja sua carteira, seus ativos e sua identidade.',
    meta: '15 de setembro  |  Leitura de 2 min',
    image: 'monkey-headphones',
  },
]

/** "Diário da Cunhagem": editorial content of the Figma; articles are not part of the demo. */
function MintJournal() {
  const announce = useAnnounce()
  return (
    <section aria-labelledby="journal-heading" className="flex flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id="journal-heading" className="text-heading-28 font-bold text-cream">
          Diário da Cunhagem
        </h2>
        <p className="text-body-14 text-text-secondary">
          Histórias, guias e insights para colecionadores sobre o universo da propriedade digital.
        </p>
      </div>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {articles.map((article) => (
          <li key={article.title}>
            <article className="flex h-full flex-col overflow-hidden rounded-[8px] bg-surface-card">
              <div className="h-[195px] overflow-hidden">
                <NftArtwork
                  imageKey={article.image}
                  alt=""
                  sizes="(min-width: 1024px) 268px, (min-width: 640px) 45vw, 90vw"
                  className="size-full"
                />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="text-caption-12 font-medium whitespace-pre text-sand">{article.meta}</p>
                <h3 className="text-body-16 font-bold text-cream">{article.title}</h3>
                <p className="text-caption-12 font-medium text-text-secondary">{article.text}</p>
                <button
                  type="button"
                  onClick={() => announce('Os artigos do Diário da Cunhagem não fazem parte desta demonstração.')}
                  aria-label={`Ler mais: ${article.title}`}
                  className="mt-auto inline-flex items-center gap-1 self-start rounded-sm text-caption-12 font-bold text-brand-accent outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ler mais <Icon name="arrow-right" className="size-3.5" />
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}
