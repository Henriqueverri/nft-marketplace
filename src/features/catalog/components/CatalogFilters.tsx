import { useState } from 'react'
import { Slider } from '@/components/ui/slider'
import type { NftListResponse } from '@/contracts/catalog'
import { cn } from '@/lib/utils'
import { hasActiveFilters, joinList, splitList, type CatalogSearch } from '../search-params'
import type { CatalogPatch } from '../use-catalog-navigation'

type Facets = NftListResponse['facets']

interface CatalogFiltersProps {
  search: CatalogSearch
  facets: Facets | undefined
  onChange: (patch: CatalogPatch) => void
  className?: string
}

/** Sidebar filters of the Figma: collections, price range and network. */
export function CatalogFilters({ search, facets, onChange, className }: CatalogFiltersProps) {
  const collections = splitList(search.collections)
  const networks = splitList(search.networks)

  function toggle(list: string[], id: string, checked: boolean) {
    return joinList(checked ? [...list, id] : list.filter((item) => item !== id))
  }

  return (
    <div className={cn('flex flex-col gap-6 bg-surface-card p-5', className)}>
      <FacetGroup
        legend="Coleções"
        options={facets?.collections}
        selected={collections}
        onToggle={(id, checked) => onChange({ collections: toggle(collections, id, checked) })}
      />
      {facets ? (
        <PriceFilter
          // Remounts with fresh draft values whenever the applied range changes.
          key={`${search.minPrice}:${search.maxPrice}:${facets.priceRange.min}:${facets.priceRange.max}`}
          range={facets.priceRange}
          minPrice={search.minPrice}
          maxPrice={search.maxPrice}
          onApply={(minPrice, maxPrice) => onChange({ minPrice, maxPrice })}
        />
      ) : null}
      <FacetGroup
        legend="Rede"
        options={facets?.networks}
        selected={networks}
        onToggle={(id, checked) => onChange({ networks: toggle(networks, id, checked) })}
      />
      {hasActiveFilters(search) ? (
        <button
          type="button"
          onClick={() =>
            onChange({ q: undefined, collections: undefined, networks: undefined, minPrice: undefined, maxPrice: undefined })
          }
          className="self-start rounded-sm text-body-14 font-bold text-brand-accent underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  )
}

interface FacetGroupProps {
  legend: string
  options: Facets['collections'] | undefined
  selected: string[]
  onToggle: (id: string, checked: boolean) => void
}

function FacetGroup({ legend, options, selected, onToggle }: FacetGroupProps) {
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-2 text-body-18 font-bold text-cream">{legend}</legend>
      {options ? (
        <ul className="flex flex-col">
          {options.map((option) => {
            const checked = selected.includes(option.id)
            return (
              <li key={option.id}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 text-body-15 leading-10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                    checked ? 'font-bold text-brand-accent' : 'text-text-secondary hover:text-cream',
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(event) => onToggle(option.id, event.target.checked)}
                  />
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn('size-1.5 rounded-full', checked ? 'bg-brand-accent' : 'bg-transparent')}
                    />
                    {option.name}
                  </span>
                  <span className="font-bold">({option.count})</span>
                </label>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="px-2 text-body-14 text-text-secondary">Carregando…</p>
      )}
    </fieldset>
  )
}

const toCents = (value: number) => Math.round(value * 100)
const formatRange = (cents: number) => (cents / 100).toFixed(2).replace('.', ',')

interface PriceFilterProps {
  range: Facets['priceRange']
  minPrice: number | undefined
  maxPrice: number | undefined
  onApply: (minPrice: number | undefined, maxPrice: number | undefined) => void
}

/**
 * Two-thumb slider in hundredths of ETH. Dragging only moves a draft; "Aplicar"
 * writes the range to the URL. A bound at the catalog limit means "no limit".
 */
function PriceFilter({ range, minPrice, maxPrice, onApply }: PriceFilterProps) {
  const lower = Math.floor(Number(range.min) * 100)
  const upper = Math.ceil(Number(range.max) * 100)
  const clamp = (cents: number) => Math.min(Math.max(cents, lower), upper)
  const [draft, setDraft] = useState<number[]>([
    clamp(minPrice === undefined ? lower : toCents(minPrice)),
    clamp(maxPrice === undefined ? upper : toCents(maxPrice)),
  ])

  function apply() {
    const [from, to] = draft
    onApply(from <= lower ? undefined : from / 100, to >= upper ? undefined : to / 100)
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-body-18 font-bold text-cream">Faixa de preço</legend>
      <Slider
        min={lower}
        max={upper}
        step={1}
        minStepsBetweenThumbs={0}
        value={draft}
        onValueChange={setDraft}
        thumbLabels={['Preço mínimo', 'Preço máximo']}
        getValueText={(cents) => `${formatRange(cents)} ETH`}
        className="px-2"
      />
      <p className="px-2 text-body-15 text-text-secondary" aria-live="polite">
        Preço: {formatRange(draft[0])} - {formatRange(draft[1])} ETH
      </p>
      <button
        type="button"
        onClick={apply}
        className="ml-2 h-8 self-start rounded-[6px] bg-brand px-3 text-body-16 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-card"
      >
        Aplicar
      </button>
    </fieldset>
  )
}
