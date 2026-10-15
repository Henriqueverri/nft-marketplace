import { createContext, useContext } from 'react'

export type Announce = (message: string) => void

export const AnnouncerContext = createContext<Announce>(() => {})

/** Shows a short message and reads it to assistive technologies (polite live region). */
export function useAnnounce(): Announce {
  return useContext(AnnouncerContext)
}
