import { http, HttpResponse } from 'msw'
import { loginRequestSchema, signupRequestSchema, type AuthSession, type CurrentSession } from '@/contracts/auth'
import { transaction, readDb } from '../db/database'
import { createSessionToken, digestToken, getDummyPasswordHash, hashPassword, verifyPassword } from '../db/password'
import type { DbState, UserRecord } from '../db/schema'
import { withNetwork } from '../network'
import { closeSessionConnections } from '../socket'
import { apiError, readJson, validationError } from './respond'
import { requireSession, SESSION_TTL_MS, toAccountUser } from './session'

/** The token is created before the transaction because digesting it is async. */
async function prepareSession() {
  const token = createSessionToken()
  const now = new Date()
  return {
    token,
    tokenHash: await digestToken(token),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
  }
}

function conflictsOf(db: DbState, email: string, username: string) {
  return {
    emailTaken: db.users.some((user) => user.email === email),
    usernameTaken: db.users.some((user) => user.username.toLowerCase() === username.toLowerCase()),
  }
}

function conflictResponse(emailTaken: boolean, usernameTaken: boolean) {
  if (emailTaken) {
    return apiError('EMAIL_TAKEN', 'Já existe uma conta com este e-mail.', {
      email: ['Já existe uma conta com este e-mail.'],
    })
  }
  if (usernameTaken) {
    return apiError('USERNAME_TAKEN', 'Este nome de usuário já está em uso.', {
      username: ['Este nome de usuário já está em uso.'],
    })
  }
  return null
}

export const authHandlers = [
  http.post(
    '/api/auth/signup',
    withNetwork(async ({ request }) => {
      const parsed = signupRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)
      const { username, email, password } = parsed.data

      const before = conflictsOf(await readDb(), email, username)
      const conflict = conflictResponse(before.emailTaken, before.usernameTaken)
      if (conflict) return conflict

      const credential = await hashPassword(password)
      const pending = await prepareSession()

      const result = await transaction((draft) => {
        // Checked again inside the transaction: hashing is async and another tab may
        // have created the same account meanwhile.
        const now = conflictsOf(draft, email, username)
        if (now.emailTaken || now.usernameTaken) return { conflict: now }

        const user: UserRecord = {
          id: `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
          username,
          email,
          displayName: username,
          ensName: null,
          walletNickname: null,
          avatarUrl: null,
          createdAt: pending.createdAt,
          profileVersion: 1,
        }
        draft.users.push(user)
        draft.credentials.push({ userId: user.id, ...credential })
        draft.walletsByUser[user.id] = []
        draft.favoritesByUser[user.id] = []
        draft.sessions.push({
          id: `ses_${crypto.randomUUID()}`,
          userId: user.id,
          tokenHash: pending.tokenHash,
          createdAt: pending.createdAt,
          expiresAt: pending.expiresAt,
          revokedAt: null,
        })
        return { user }
      })

      if (result.conflict) {
        return conflictResponse(result.conflict.emailTaken, result.conflict.usernameTaken)!
      }
      const body: AuthSession = {
        token: pending.token,
        expiresAt: pending.expiresAt,
        user: toAccountUser(result.user),
      }
      return HttpResponse.json(body, { status: 201 })
    }),
  ),

  http.post(
    '/api/auth/login',
    withNetwork(async ({ request }) => {
      const parsed = loginRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)
      const { email, password } = parsed.data

      const db = await readDb()
      const user = db.users.find((candidate) => candidate.email === email)
      const credential = user && db.credentials.find((candidate) => candidate.userId === user.id)
      // Unknown e-mails are verified against a dummy hash: same error, same cost.
      const valid = await verifyPassword(password, credential ?? (await getDummyPasswordHash()))
      if (!user || !credential || !valid) {
        return apiError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.')
      }

      const pending = await prepareSession()
      await transaction((draft) => {
        draft.sessions.push({
          id: `ses_${crypto.randomUUID()}`,
          userId: user.id,
          tokenHash: pending.tokenHash,
          createdAt: pending.createdAt,
          expiresAt: pending.expiresAt,
          revokedAt: null,
        })
      })

      const body: AuthSession = { token: pending.token, expiresAt: pending.expiresAt, user: toAccountUser(user) }
      return HttpResponse.json(body)
    }),
  ),

  http.get(
    '/api/auth/session',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const body: CurrentSession = { expiresAt: auth.session.expiresAt, user: toAccountUser(auth.user) }
      return HttpResponse.json(body)
    }),
  ),

  http.post(
    '/api/auth/logout',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const revokedAt = new Date().toISOString()
      await transaction((draft) => {
        const session = draft.sessions.find((candidate) => candidate.id === auth.session.id)
        if (session) session.revokedAt = revokedAt
      })
      closeSessionConnections(auth.session.id)
      return new HttpResponse(null, { status: 204 })
    }),
  ),
]
