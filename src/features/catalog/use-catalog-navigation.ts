import { useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import type { CatalogSearch } from './search-params'

export type CatalogPatch = Partial<CatalogSearch>

/**
 * Writes catalog state to the URL, its only home. Any change other than the page
 * itself goes back to page 1, so a filter can never leave the user on a page that
 * no longer exists. Each change is a history entry (back/forward restore it).
 */
export function useCatalogNavigation(search: CatalogSearch) {
  const navigate = useNavigate()
  return useCallback(
    (patch: CatalogPatch, options: { replace?: boolean } = {}) => {
      const changesPage = Object.keys(patch).every((key) => key === 'page')
      void navigate({
        to: '/',
        search: { ...search, ...patch, ...(changesPage ? {} : { page: 1 }) },
        replace: options.replace ?? false,
        resetScroll: false,
      })
    },
    [navigate, search],
  )
}

/** Focuses the visible catalog search field (there is one per layout). */
export function focusCatalogSearch(): boolean {
  const fields = document.querySelectorAll<HTMLInputElement>('input[data-catalog-search]')
  const visible = [...fields].find((field) => field.getClientRects().length > 0)
  if (!visible) return false
  visible.focus()
  visible.scrollIntoView({ block: 'center' })
  return true
}
