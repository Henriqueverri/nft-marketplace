import {
  accountProfileSchema,
  type AccountProfile,
  type UpdateAvatarRequest,
  type UpdateProfileRequest,
} from '@/contracts/account'
import type { ChangePasswordRequest } from '@/contracts/auth'
import { http, parseResponse } from '@/shared/api/http'

export async function fetchProfile(signal?: AbortSignal): Promise<AccountProfile> {
  const response = await http.get('/me', { signal })
  return parseResponse(accountProfileSchema, response.data)
}

export async function updateProfile(body: UpdateProfileRequest): Promise<AccountProfile> {
  const response = await http.patch('/me', body)
  return parseResponse(accountProfileSchema, response.data)
}

export async function updateAvatar(body: UpdateAvatarRequest): Promise<AccountProfile> {
  const response = await http.put('/me/avatar', body)
  return parseResponse(accountProfileSchema, response.data)
}

export async function changePassword(body: ChangePasswordRequest): Promise<void> {
  await http.post('/me/password', body)
}
