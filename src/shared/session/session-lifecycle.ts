import type { QueryClient } from '@tanstack/react-query'
import { clearUserDrafts } from './drafts'
import { sessionStore } from './session-store'

/**
 * On every session change (login, logout, expiry, another tab), in-flight queries are
 * cancelled and the whole query cache is dropped synchronously, before any component
 * can render data of the previous session. Public data is simply fetched again.
 *
 * Settled mutations are dropped too (their variables may hold private input). A pending
 * mutation is kept: it is the login or signup that is starting the new session.
 * Logout also deletes the previous user's drafts; expiry keeps them for resumption.
 */
export function bindSessionToQueryClient(queryClient: QueryClient): () => void {
  return sessionStore.subscribe((next, previous) => {
    void queryClient.cancelQueries()
    queryClient.getQueryCache().clear()
    const mutationCache = queryClient.getMutationCache()
    for (const mutation of mutationCache.getAll()) {
      if (mutation.state.status !== 'pending') mutationCache.remove(mutation)
    }
    if (next.endReason === 'logout' && previous.userId) clearUserDrafts(previous.userId)
  })
}
