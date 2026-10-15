import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { AnnouncerContext } from './announcer-context'

const VISIBLE_MS = 6_000

/**
 * Global feedback for actions and realtime changes. The live region is always in the
 * DOM (screen readers ignore regions inserted together with their content).
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null)

  const announce = useCallback((text: string) => {
    setMessage((current) => ({ text, id: (current?.id ?? 0) + 1 }))
  }, [])

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [message])

  return (
    <AnnouncerContext value={announce}>
      {children}
      <div
        role="status"
        aria-live="polite"
        data-testid="announcer"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex justify-center"
      >
        {message ? (
          <p
            key={message.id}
            className="pointer-events-auto max-w-md rounded-[5px] border border-brand bg-surface-card px-4 py-3 text-caption-13 text-cream shadow-glow"
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </AnnouncerContext>
  )
}
