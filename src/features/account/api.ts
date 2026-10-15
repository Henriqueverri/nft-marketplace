import { accountProfileSchema, type AccountProfile, type UpdateProfileRequest } from '@/contracts/account'
import { http, parseResponse } from '@/shared/api/http'

export async function fetchProfile(signal?: AbortSignal): Promise<AccountProfile> {
  const response = await http.get('/account/profile', { signal })
  return parseResponse(accountProfileSchema, response.data)
}

export async function updateProfile(body: UpdateProfileRequest): Promise<AccountProfile> {
  const response = await http.patch('/account/profile', body)
  return parseResponse(accountProfileSchema, response.data)
}
