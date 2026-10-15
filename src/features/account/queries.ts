import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AccountProfile, UpdateAvatarRequest, UpdateProfileRequest } from '@/contracts/account'
import type { ChangePasswordRequest, CurrentSession } from '@/contracts/auth'
import { useRealtimeEvent } from '@/shared/realtime/context'
import { privateQueryKey, sessionQueryKey } from '@/shared/session/query-keys'
import { changePassword, fetchProfile, updateAvatar, updateProfile } from './api'

export const accountKeys = {
  profile: (userId: string) => privateQueryKey(userId, 'profile'),
}

export function profileQueryOptions(userId: string) {
  return queryOptions({
    queryKey: accountKeys.profile(userId),
    queryFn: ({ signal }) => fetchProfile(signal),
  })
}

/** Keeps whichever copy is newer, so an old event or response never overwrites a newer one. */
function newest(current: AccountProfile | undefined, incoming: AccountProfile): AccountProfile {
  return current && current.version >= incoming.version ? current : incoming
}

export function useProfile(userId: string) {
  const queryClient = useQueryClient()
  useRealtimeEvent('profile.updated', (event) => {
    // Events of other users never get here (dropped by the provider); this guard keeps
    // the key and the event owner tied together even so.
    if (event.userId !== userId) return
    queryClient.setQueryData<AccountProfile>(accountKeys.profile(userId), (current) =>
      newest(current, event.payload),
    )
  })
  return useQuery(profileQueryOptions(userId))
}

export function useUpdateProfile(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateProfileRequest) => updateProfile(body),
    onSuccess: (profile) => {
      queryClient.setQueryData<AccountProfile>(accountKeys.profile(userId), (current) =>
        newest(current, profile),
      )
      queryClient.setQueryData<CurrentSession>(sessionQueryKey, (current) =>
        current ? { ...current, user: { ...current.user, displayName: profile.displayName } } : current,
      )
    },
  })
}

export function useUpdateAvatar(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateAvatarRequest) => updateAvatar(body),
    onSuccess: (profile) => {
      queryClient.setQueryData<AccountProfile>(accountKeys.profile(userId), (current) => newest(current, profile))
      queryClient.setQueryData<CurrentSession>(sessionQueryKey, (current) =>
        current ? { ...current, user: { ...current.user, avatarUrl: profile.avatarUrl } } : current,
      )
    },
  })
}

export function useChangePassword() {
  return useMutation({ mutationFn: (body: ChangePasswordRequest) => changePassword(body) })
}
