import { http, HttpResponse } from 'msw'
import { updateProfileRequestSchema, type AccountProfile } from '@/contracts/account'
import type { ProfileUpdatedEvent } from '@/contracts/events'
import { transaction } from '../db/database'
import type { UserRecord } from '../db/schema'
import { withNetwork } from '../network'
import { createEnvelope, emitToUser } from '../socket'
import { readJson, validationError } from './respond'
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
    '/api/account/profile',
    withNetwork(async ({ request }) => {
      const auth = await requireSession(request)
      if (!auth.ok) return auth.response
      return HttpResponse.json(toAccountProfile(auth.user))
    }),
  ),

  http.patch(
    '/api/account/profile',
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
]
