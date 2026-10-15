import { useEffect, useId, useState, type FormEvent } from 'react'
import { SEARCH_MAX_LENGTH } from '@/contracts/catalog'
import { cn } from '@/lib/utils'
import { Icon } from '@/shared/ui/Icon'

const SEARCH_DEBOUNCE_MS = 350

interface SearchFieldProps {
  /** Committed term (from the URL). */
  value: string | undefined
  onCommit: (term: string | undefined) => void
  className?: string
}

/**
 * Search box (Figma "Explorar coleções"). The draft is local only while typing; it is
 * written to the URL after a short pause or on Enter, and replaced whenever the URL
 * changes from elsewhere (back/forward, clear filters).
 */
export function SearchField({ value = '', onCommit, className }: SearchFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState({ committed: value, text: value })
  if (draft.committed !== value) setDraft({ committed: value, text: value })

  const pending = draft.text.trim() !== value
  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => onCommit(draft.text.trim() || undefined), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [pending, draft.text, onCommit])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) onCommit(draft.text.trim() || undefined)
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        Buscar NFTs
      </label>
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-text-secondary"
      />
      <input
        id={id}
        type="search"
        data-catalog-search=""
        value={draft.text}
        maxLength={SEARCH_MAX_LENGTH}
        onChange={(event) => setDraft({ committed: value, text: event.target.value })}
        placeholder="Explorar coleções"
        autoComplete="off"
        className="h-[45px] w-full rounded-[10px] border border-transparent bg-surface-card pr-3 pl-11 text-body-14 font-bold text-cream outline-none placeholder:text-sand focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-search-cancel-button]:invert-[.6]"
      />
    </form>
  )
}
