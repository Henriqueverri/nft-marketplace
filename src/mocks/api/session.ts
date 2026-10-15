import type { AccountUser } from '@/contracts/account'
import { readDb } from '../db/database'
import { digestToken } from '../db/password'
import type { SessionRecord, UserRecord } from '../db/schema'
import { apiError } from './respond'

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000

export type SessionLookup =
  | { status: 'valid'; session: SessionRecord; user: UserRecord }
  | { status: 'missing' | 'invalid' | 'expired' }

/** Resolves an opaque token to its session. Shared by REST handlers and the socket. */
export async function lookupSession(token: string | null | undefined): Promise<SessionLookup> {
  if (!token) return { status: 'missing' }
  const db = await readDb()
  const tokenHash = await digestToken(token)
  const session = db.sessions.find((candidate) => candidate.tokenHash === tokenHash)
  if (!session || session.revokedAt) return { status: 'invalid' }
  if (Date.parse(session.expiresAt) <= Date.now()) return { status: 'expired' }
  const user = db.users.find((candidate) => candidate.id === session.userId)
  if (!user) return { status: 'invalid' }
  return { status: 'valid', session, user }
}

export function isSessionActive(db: { sessions: SessionRecord[] }, sessionId: string): boolean {
  const session = db.sessions.find((candidate) => candidate.id === sessionId)
  return !!session && !session.revokedAt && Date.parse(session.expiresAt) > Date.now()
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  const match = header?.match(/^Bearer (.+)$/)
  return match ? match[1] : null
}

/**
 * Authorization boundary of the mock API: private handlers take the user identity
 * only from the session token, never from the request body, path or query.
 */
export async function requireSession(request: Request) {
  const lookup = await lookupSession(bearerToken(request))
  switch (lookup.status) {
    case 'valid':
      return { ok: true as const, user: lookup.user, session: lookup.session }
    case 'expired':
      return {
        ok: false as const,
        response: apiError('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente para continuar.'),
      }
    default:
      return {
        ok: false as const,
        response: apiError('UNAUTHENTICATED', 'Entre na sua conta para continuar.'),
      }
  }
}

export function toAccountUser(user: UserRecord): AccountUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  }
}
