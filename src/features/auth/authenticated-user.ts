import { createContext, useContext } from 'react'
import type { AccountUser } from '@/contracts/account'

/** The signed-in user, available below the `_authenticated` layout only. */
export const AuthenticatedUserContext = createContext<AccountUser | null>(null)

export function useAuthenticatedUser(): AccountUser {
  const user = useContext(AuthenticatedUserContext)
  if (!user) throw new Error('useAuthenticatedUser must be used below the _authenticated layout')
  return user
}
