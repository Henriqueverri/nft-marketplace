import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { sessionQueryOptions } from './queries'
import type { AuthSearch } from './redirect'

/**
 * Signed-in users skip the auth screens. A failing session check (offline, API down)
 * keeps them on the form instead of blocking it.
 */
export async function redirectIfAuthenticated({
  context,
  search,
}: {
  context: { queryClient: QueryClient }
  search: AuthSearch
}): Promise<void> {
  const session = await context.queryClient.fetchQuery(sessionQueryOptions()).catch(() => null)
  if (session) throw redirect({ href: search.redirect ?? '/', replace: true })
}
