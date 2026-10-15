import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { CATALOG_PAGE_SIZE } from '@/contracts/catalog'
import { errorMessage } from '@/shared/forms/form-errors'
import { Icon } from '@/shared/ui/Icon'
import { useNftList } from '../queries'
import { hasActiveFilters, splitList, toListParams, type CatalogSearch } from '../search-params'
import { useCatalogNavigation, type CatalogPatch } from '../use-catalog-navigation'
import { CatalogFilters } from './CatalogFilters'
import { CatalogToolbar } from './CatalogToolbar'
import { NftCard } from './NftCard'
import { Pagination } from './Pagination'
import { SearchField } from './SearchField'

const CARD_SIZES = '(min-width: 1024px) 258px, (min-width: 768px) 30vw, 45vw'
/** Cards of the first grid row on phones (two columns), where they are the LCP element. */
const FIRST_ROW_CARDS = 2

interface CatalogSectionProps {
  search: CatalogSearch
  /** Sidebar content below the filters (the spotlight banner). */
  aside?: ReactNode
}

/** Catalog of the home: filters (sidebar or drawer), views, sorting, grid and pages. */
export function CatalogSection({ search, aside }: CatalogSectionProps) {
  const params = toListParams(search)
  const list = useNftList(params)
  const update = useCatalogNavigation(search)
  const data = list.data

  // A page past the end (old link, catalog shrank) is replaced by the last valid page.
  const totalPages = data?.totalPages
  const settled = !list.isPlaceholderData && data !== undefined
  useEffect(() => {
    if (!settled || totalPages === undefined) return
    const lastPage = Math.max(totalPages, 1)
    if (search.page > lastPage) update({ page: lastPage }, { replace: true })
  }, [settled, totalPages, search.page, update])

  return (
    <section id="catalogo" aria-labelledby="catalog-heading" className="scroll-mt-6">
      <h2 id="catalog-heading" className="sr-only">
        Catálogo de NFTs
      </h2>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
        <aside aria-label="Filtros do catálogo" className="hidden w-[310px] shrink-0 flex-col gap-8 lg:flex">
          <SearchField value={search.q} onCommit={(q) => update({ q })} />
          <CatalogFilters search={search} facets={data?.facets} onChange={update} />
          {aside}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <CatalogToolbar search={search} onChange={update} />
          <CatalogResults search={search} list={list} onChange={update} />
        </div>
      </div>
    </section>
  )
}

/** Search box and filter drawer shown above the hero below 1024px (Figma mobile). */
export function CatalogSearchBar({ search }: { search: CatalogSearch }) {
  const update = useCatalogNavigation(search)
  const list = useNftList(toListParams(search))
  const [open, setOpen] = useState(false)
  const activeCount =
    splitList(search.collections).length +
    splitList(search.networks).length +
    (search.minPrice !== undefined || search.maxPrice !== undefined ? 1 : 0)

  return (
    <div className="flex items-center gap-3 lg:hidden">
      <SearchField value={search.q} onCommit={(q) => update({ q })} className="flex-1" />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={activeCount ? `Filtros (${activeCount} ativos)` : 'Filtros'}
            className="relative flex size-[45px] shrink-0 items-center justify-center rounded-[14px] bg-linear-to-br from-brand/45 to-brand text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            <Icon name="filter" className="size-[22px]" />
            {activeCount ? (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-cream text-tiny-11 font-bold text-ink"
              >
                {activeCount}
              </span>
            ) : null}
          </button>
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/60"
          className="top-0 right-0 left-auto flex h-dvh w-[min(100%,360px)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none bg-ink p-0 ring-0 sm:max-w-[360px]"
        >
          <div className="flex items-center justify-between border-b border-border-strong px-5 py-4">
            <DialogTitle className="text-title-20 font-bold text-cream">Filtros</DialogTitle>
            <DialogClose className="flex size-9 items-center justify-center rounded-full text-cream outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring">
              <Icon name="close" className="size-[18px]" />
              <span className="sr-only">Fechar</span>
            </DialogClose>
          </div>
          <DialogDescription className="sr-only">
            Os filtros são aplicados imediatamente à lista de NFTs.
          </DialogDescription>
          <CatalogFilters search={search} facets={list.data?.facets} onChange={update} className="flex-1" />
          <div className="sticky bottom-0 border-t border-border-strong bg-ink p-4">
            <DialogClose className="h-11 w-full rounded-[6px] bg-brand text-body-16 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
              {list.data ? `Ver ${list.data.totalItems} resultados` : 'Ver resultados'}
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

interface CatalogResultsProps {
  search: CatalogSearch
  list: ReturnType<typeof useNftList>
  onChange: (patch: CatalogPatch) => void
}

function CatalogResults({ search, list, onChange }: CatalogResultsProps) {
  const headingRef = useRef<HTMLParagraphElement>(null)
  const previousPage = useRef(search.page)
  // After a page change, focus moves to the results so keyboard and screen reader
  // users continue from the top of the new page.
  useEffect(() => {
    if (previousPage.current === search.page) return
    previousPage.current = search.page
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView({ block: 'start' })
  }, [search.page])

  const { data } = list
  const updating = list.isPlaceholderData && list.isFetching

  let status: string
  if (list.isPending) status = 'Carregando NFTs…'
  else if (!data) status = 'Não foi possível carregar os NFTs.'
  else if (data.totalItems === 0) status = 'Nenhum NFT encontrado.'
  else status = `${data.totalItems} ${data.totalItems === 1 ? 'NFT encontrado' : 'NFTs encontrados'}`

  const retryButton = (
    <button
      type="button"
      onClick={() => void list.refetch()}
      className="h-10 rounded-[6px] bg-brand px-4 text-body-14 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card"
    >
      Tentar novamente
    </button>
  )

  return (
    <div className="flex flex-col gap-8">
      <p
        ref={headingRef}
        tabIndex={-1}
        role="status"
        data-testid="catalog-status"
        className="scroll-mt-6 rounded-sm text-body-14 text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {status}
        {updating ? <span className="sr-only"> Atualizando…</span> : null}
      </p>

      {data && list.isError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[8px] bg-surface-card p-4">
          <p className="text-body-14 text-text-secondary">
            Não foi possível atualizar a lista. Exibindo os últimos dados carregados.
          </p>
          {retryButton}
        </div>
      ) : null}

      {list.isPending ? (
        <CardGridSkeleton count={CATALOG_PAGE_SIZE} />
      ) : !data ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-[8px] bg-surface-card p-6">
          <p className="text-body-16 font-bold text-cream">Não foi possível carregar os NFTs.</p>
          <p className="text-body-14 text-text-secondary">{errorMessage(list.error)}</p>
          {retryButton}
        </div>
      ) : data.items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[8px] bg-surface-card p-6" data-testid="catalog-empty">
          <p className="text-body-16 font-bold text-cream">Nenhum NFT corresponde à sua busca.</p>
          <p className="text-body-14 text-text-secondary">Tente outros termos ou remova alguns filtros.</p>
          {hasActiveFilters(search) ? (
            <button
              type="button"
              onClick={() =>
                onChange({ q: undefined, collections: undefined, networks: undefined, minPrice: undefined, maxPrice: undefined })
              }
              className="h-10 rounded-[6px] border border-brand px-4 text-body-14 font-bold text-cream outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
            >
              Limpar filtros
            </button>
          ) : null}
        </div>
      ) : (
        <ul
          aria-busy={updating}
          aria-label="NFTs"
          className="grid grid-cols-2 gap-x-4 gap-y-8 transition-opacity aria-busy:opacity-60 md:gap-x-8 md:gap-y-[72px] max-md:[&>li:nth-child(even)]:mt-8 lg:grid-cols-3"
        >
          {data.items.map((nft, index) => (
            <li key={nft.id}>
              <NftCard nft={nft} sizes={CARD_SIZES} imagePriority={index < FIRST_ROW_CARDS} />
            </li>
          ))}
        </ul>
      )}

      {data ? <Pagination search={search} totalPages={data.totalPages} /> : null}
    </div>
  )
}

export function CardGridSkeleton({ count, className }: { count: number; className?: string }) {
  return (
    <ul
      aria-hidden="true"
      data-testid="catalog-skeleton"
      className={className ?? 'grid grid-cols-2 gap-x-4 gap-y-8 md:gap-x-8 md:gap-y-[72px] lg:grid-cols-3'}
    >
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="flex flex-col gap-3">
          <Skeleton className="aspect-square w-full rounded-none" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-5 w-1/3" />
        </li>
      ))}
    </ul>
  )
}
