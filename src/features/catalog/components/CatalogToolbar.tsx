import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { nftSortSchema, type NftSort, type NftView } from '@/contracts/catalog'
import { cn } from '@/lib/utils'
import type { CatalogSearch } from '../search-params'
import type { CatalogPatch } from '../use-catalog-navigation'

const viewLabels: Record<NftView, string> = {
  all: 'Todos os NFTs',
  new: 'Novos lançamentos',
  trending: 'Em alta',
}

const sortLabels: Record<NftSort, string> = {
  recent: 'Listados recentemente',
  'price-asc': 'Menor preço',
  'price-desc': 'Maior preço',
  name: 'Nome (A–Z)',
}

/**
 * Views are links (each one is a URL), marked with aria-current; sorting is a
 * select. Both go back to page 1.
 */
export function CatalogToolbar({
  search,
  onChange,
}: {
  search: CatalogSearch
  onChange: (patch: CatalogPatch) => void
}) {
  const sortLabelId = useId()
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <nav aria-label="Seções do catálogo" className="max-w-full shrink-0">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {(Object.keys(viewLabels) as NftView[]).map((view) => {
            const active = search.view === view
            return (
              <li key={view}>
                <Link
                  to="/"
                  search={{ ...search, view, page: 1 }}
                  resetScroll={false}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-sm border-b-2 pb-1 text-body-15 font-medium whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? 'border-brand text-brand-accent' : 'border-transparent text-cream hover:text-brand-accent',
                  )}
                >
                  {viewLabels[view]}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="flex max-w-full min-w-0 items-center gap-2 text-body-15 text-cream">
        <span id={sortLabelId} className="shrink-0 whitespace-nowrap">
          Ordenar por:
        </span>
        <Select value={search.sort} onValueChange={(value) => onChange({ sort: nftSortSchema.parse(value) })}>
          <SelectTrigger
            aria-labelledby={sortLabelId}
            className="h-9 min-w-0 border-border-field bg-transparent text-body-15 text-cream dark:bg-transparent"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {nftSortSchema.options.map((sort) => (
              <SelectItem key={sort} value={sort} className="text-body-14">
                {sortLabels[sort]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
