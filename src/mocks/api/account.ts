import { http, HttpResponse } from 'msw'
import {
  updateAvatarRequestSchema,
  updateProfileRequestSchema,
  type AccountProfile,
} from '@/contracts/account'
import { changePasswordRequestSchema } from '@/contracts/auth'
import type { ProfileUpdatedEvent } from '@/contracts/events'
import { readDb, transaction } from '../db/database'
import { hashPassword, verifyPassword } from '../db/password'
import type { UserRecord } from '../db/schema'
import { withNetwork } from '../network'
import { createEnvelope, emitToUser } from '../socket'
import { apiError, readJson, validationError } from './respond'
import { requireSession } from './session'

export function toAccountProfile(user: UserRecord): AccountProfile {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    ensName: user.ensName,
    walletNickname: user.walletNickname,
    createdAt: user.createdAt,
    version: user.profileVersion,
  }
}

export function profileUpdatedEvent(profile: AccountProfile): ProfileUpdatedEvent {
  return {
    ...createEnvelope('profile.updated', { kind: 'profile', id: profile.id }, profile.version, profile),
    userId: profile.id,
  }
}

/** Applies a display name change and returns the new profile. Shared with the control API. */
export async function updateDisplayName(userId: string, displayName: string): Promise<AccountProfile> {
  return transaction((draft) => {
    const user = draft.users.find((candidate) => candidate.id === userId)
    if (!user) throw new Error(`Unknown user ${userId}`)
    user.displayName = displayName
    user.profileVersion += 1
    return toAccountProfile(user)
  })
}

export const accountHandlers = [
  http.get(
    '/api/me',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      return HttpResponse.json(toAccountProfile(auth.user))
    }),
  ),

  http.patch(
    '/api/me',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const parsed = updateProfileRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)

      const profile = await updateDisplayName(auth.user.id, parsed.data.displayName)
      await emitToUser(profile.id, 'profile.updated', profileUpdatedEvent(profile))
      return HttpResponse.json(profile)
    }),
  ),

  http.put(
    '/api/me/avatar',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const parsed = updateAvatarRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)

      const profile = await transaction((draft) => {
        const user = draft.users.find((candidate) => candidate.id === auth.user.id)!
        user.avatarUrl = parsed.data.avatarUrl
        user.profileVersion += 1
        return toAccountProfile(user)
      })
      await emitToUser(profile.id, 'profile.updated', profileUpdatedEvent(profile))
      return HttpResponse.json(profile)
    }),
  ),

  http.post(
    '/api/me/password',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      const parsed = changePasswordRequestSchema.safeParse(await readJson(request))
      if (!parsed.success) return validationError(parsed.error)

      const db = await readDb()
      const current = db.credentials.find((credential) => credential.userId === auth.user.id)
      if (!current || !(await verifyPassword(parsed.data.currentPassword, current))) {
        return apiError('VALIDATION_FAILED', 'A senha atual está incorreta.', {
          currentPassword: ['A senha atual está incorreta.'],
        })
      }
      const next = await hashPassword(parsed.data.newPassword)
      await transaction((draft) => {
        const credential = draft.credentials.find((candidate) => candidate.userId === auth.user.id)!
        Object.assign(credential, next)
      })
      return new HttpResponse(null, { status: 204 })
    }),
  ),
]
