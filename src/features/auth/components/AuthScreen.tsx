import { HomePage } from '@/features/home/HomePage'
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query'
import type { AuthSearch } from '../redirect'
import { AuthDialog } from './AuthDialog'
import { AuthPage } from './AuthPage'

export type AuthMode = 'login' | 'signup'

interface AuthScreenProps {
  mode: AuthMode
  search: AuthSearch
}

/** The Figma draws auth as a modal over the home on desktop and as its own page on mobile. */
export function AuthScreen({ mode, search }: AuthScreenProps) {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const redirect = search.redirect ?? '/'
  const expired = search.reason === 'expired'

  if (!isDesktop) return <AuthPage mode={mode} redirect={redirect} expired={expired} />
  return (
    <>
      <HomePage />
      <AuthDialog mode={mode} redirect={redirect} expired={expired} />
    </>
  )
}
