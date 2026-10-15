import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Icon } from '@/shared/ui/Icon'
import type { CatalogSearch } from '../search-params'

/** Pages to show: all of them when few, otherwise the ends and the current neighborhood. */
function visiblePages(current: number, total: number): (number | 'gap')[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const pages = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))
  const sorted = [...pages].sort((a, b) => a - b)
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? ['gap' as const, page] : [page]))
}

const boxClass =
  'flex size-[35px] items-center justify-center rounded-[4px] text-body-18 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

export function Pagination({ search, totalPages }: { search: CatalogSearch; totalPages: number }) {
  if (totalPages <= 1) return null
  const current = Math.min(search.page, totalPages)
  const linkProps = (page: number) => ({ to: '/' as const, search: { ...search, page }, resetScroll: false })

  return (
    <nav aria-label="Paginação" className="flex justify-center">
      <ul className="flex flex-wrap items-center justify-center gap-2.5">
        <li>
          {current > 1 ? (
            <Link {...linkProps(current - 1)} aria-label="Página anterior" className={cn(boxClass, 'text-cream hover:text-brand-accent')}>
              <Icon name="chevron-right" className="size-[18px] rotate-180" />
            </Link>
          ) : null}
        </li>
        {visiblePages(current, totalPages).map((page, index) =>
          page === 'gap' ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-1 text-text-secondary">
              …
            </li>
          ) : (
            <li key={page}>
              <Link
                {...linkProps(page)}
                aria-label={`Página ${page}`}
                aria-current={page === current ? 'page' : undefined}
                className={cn(
                  boxClass,
                  page === current
                    ? 'bg-brand font-bold text-ink'
                    : 'border border-border-field text-cream hover:border-brand hover:text-brand-accent',
                )}
              >
                {page}
              </Link>
            </li>
          ),
        )}
        <li>
          {current < totalPages ? (
            <Link {...linkProps(current + 1)} aria-label="Próxima página" className={cn(boxClass, 'text-cream hover:text-brand-accent')}>
              <Icon name="chevron-right" className="size-[18px]" />
            </Link>
          ) : null}
        </li>
      </ul>
    </nav>
  )
}
