import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { AuthSession, CurrentSession, LoginRequest, SignupRequest } from '@/contracts/auth'
import { ApiError } from '@/shared/api/errors'
import { sessionQueryKey } from '@/shared/session/query-keys'
import { sessionStore } from '@/shared/session/session-store'
import { fetchCurrentSession, login, logout, signup } from './api'

/**
 * The session as known by the API. Without a token there is nothing to ask; with an
 * invalid or expired token the API answers 401, the HTTP layer ends the local session
 * and this resolves to null.
 */
export function sessionQueryOptions() {
  return queryOptions({
    queryKey: sessionQueryKey,
    queryFn: async ({ signal }): Promise<CurrentSession | null> => {
      if (!sessionStore.getSnapshot().token) return null
      try {
        return await fetchCurrentSession(signal)
      } catch (error) {
        if (error instanceof ApiError && (error.isUnauthenticated || error.code === 'SESSION_CHANGED')) {
          return null
        }
        throw error
      }
    },
    staleTime: 60_000,
  })
}

export function useSessionSnapshot() {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot)
}

export function useSession() {
  // Subscribing to the store re-renders on every session change, so the query below
  // is recreated right after the cache reset instead of keeping a removed entry.
  useSessionSnapshot()
  return useQuery(sessionQueryOptions())
}

function useStartSession() {
  const queryClient = useQueryClient()
  return (session: AuthSession) => {
    sessionStore.start(session.token, session.user.id)
    const current: CurrentSession = { expiresAt: session.expiresAt, user: session.user }
    queryClient.setQueryData(sessionQueryOptions().queryKey, current)
  }
}

export function useLogin() {
  const startSession = useStartSession()
  return useMutation({
    mutationFn: (body: LoginRequest) => login(body),
    onSuccess: startSession,
  })
}

export function useSignup() {
  const startSession = useStartSession()
  return useMutation({
    mutationFn: (body: SignupRequest) => signup(body),
    onSuccess: startSession,
  })
}

/**
 * Revokes the session on the API, then always ends it locally. If the request fails
 * (offline), the token is still discarded from this device.
 */
export function useLogout() {
  return useMutation({
    mutationFn: async () => {
      try {
        await logout()
      } finally {
        sessionStore.end('logout')
      }
    },
  })
}
