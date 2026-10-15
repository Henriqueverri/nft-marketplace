import { useCallback, useSyncExternalStore } from 'react'

/** Desktop/tablet layouts (Figma desktop frames) start at 768px. */
export const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}
