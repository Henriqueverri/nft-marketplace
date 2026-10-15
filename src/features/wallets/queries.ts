import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { WalletConnection } from '@/contracts/wallets'
import { privateQueryKey } from '@/shared/session/query-keys'
import { connectWallet, disconnectWallet, fetchWalletConnection, fetchWallets } from './api'

export const walletKeys = {
  list: (userId: string) => privateQueryKey(userId, 'wallets'),
  connection: (userId: string, walletId: string) => privateQueryKey(userId, 'wallet-connection', walletId),
}

export function useWallets(userId: string) {
  return useQuery({ queryKey: walletKeys.list(userId), queryFn: ({ signal }) => fetchWallets(signal) })
}

/** The wallet app can drop the connection at any time: the cached state is never trusted as fresh. */
export function useWalletConnection(userId: string, walletId: string | null) {
  return useQuery({
    queryKey: walletKeys.connection(userId, walletId ?? 'none'),
    queryFn: ({ signal }) => fetchWalletConnection(walletId!, signal),
    enabled: walletId !== null,
    staleTime: 0,
  })
}

export function useConnectWallet(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (walletId: string) => connectWallet(walletId),
    onSuccess: (connection) => queryClient.setQueryData<WalletConnection>(walletKeys.connection(userId, connection.walletId), connection),
  })
}

export function useDisconnectWallet(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (walletId: string) => disconnectWallet(walletId),
    onSuccess: (connection) => queryClient.setQueryData<WalletConnection>(walletKeys.connection(userId, connection.walletId), connection),
  })
}
