import { z } from 'zod'
import {
  collectionIdSchema,
  networkIdSchema,
  nftSortSchema,
  nftViewSchema,
  SEARCH_MAX_LENGTH,
} from '@/contracts/catalog'
import type { NftListParams } from './api'

/**
 * Catalog state lives only in the URL (`/?q=…&collections=…&page=2`). Every field
 * falls back to a safe value instead of failing, so a hand-edited or outdated link
 * still opens a valid catalog. Lists are comma-separated, sorted and deduplicated, so
 * equivalent URLs share one cache entry.
 */

const MAX_PRICE_ETH = 1_000_000

/** The router parses `?q=123` as a number; text params accept both. */
const toText = (value: unknown) => (typeof value === 'number' ? String(value) : value)

function listParam(item: z.ZodType<string>) {
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') return undefined
      const valid = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => item.safeParse(part).success)
      const unique = [...new Set(valid)].sort()
      return unique.length ? unique.join(',') : undefined
    },
    z.string().optional(),
  )
}

/** ETH with at most two decimals (the precision of the price slider). */
const priceParam = z
  .preprocess((value) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0) return undefined
    return Math.round(Math.min(number, MAX_PRICE_ETH) * 100) / 100
  }, z.number().optional())
  .catch(undefined)

export const catalogSearchSchema = z
  .object({
    q: z
      .preprocess(toText, z.string().optional())
      .transform((value) => value?.trim().slice(0, SEARCH_MAX_LENGTH) || undefined)
      .catch(undefined),
    collections: listParam(collectionIdSchema).catch(undefined),
    networks: listParam(networkIdSchema).catch(undefined),
    minPrice: priceParam,
    maxPrice: priceParam,
    view: nftViewSchema.default('all').catch('all'),
    sort: nftSortSchema.default('recent').catch('recent'),
    page: z.coerce.number().int().min(1).max(1000).default(1).catch(1),
  })
  .transform((search) => {
    // A reversed range is read as the range the user meant.
    if (search.minPrice !== undefined && search.maxPrice !== undefined && search.minPrice > search.maxPrice) {
      return { ...search, minPrice: search.maxPrice, maxPrice: search.minPrice }
    }
    return search
  })

export type CatalogSearch = z.output<typeof catalogSearchSchema>

/** Values left out of the URL. */
export const CATALOG_SEARCH_DEFAULTS = { view: 'all', sort: 'recent', page: 1 } as const

/** The unfiltered catalog (shown behind the desktop auth modal). */
export const DEFAULT_CATALOG_SEARCH: CatalogSearch = catalogSearchSchema.parse({})

export function splitList(value: string | undefined): string[] {
  return value ? value.split(',') : []
}

export function joinList(values: string[]): string | undefined {
  const unique = [...new Set(values)].sort()
  return unique.length ? unique.join(',') : undefined
}

/** Two-decimal ETH as the API expects it ("0.5", "12.3"). */
export function priceToEth(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(Number(value.toFixed(2)))
}

export function toListParams(search: CatalogSearch): NftListParams {
  return {
    q: search.q,
    collections: splitList(search.collections),
    networks: splitList(search.networks),
    minPrice: priceToEth(search.minPrice),
    maxPrice: priceToEth(search.maxPrice),
    view: search.view,
    sort: search.sort,
    page: search.page,
  }
}

export function hasActiveFilters(search: CatalogSearch): boolean {
  return Boolean(
    search.q || search.collections || search.networks || search.minPrice !== undefined || search.maxPrice !== undefined,
  )
}
