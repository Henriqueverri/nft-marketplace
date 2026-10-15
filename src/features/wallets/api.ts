import { walletConnectionSchema, walletListSchema, type Wallet, type WalletConnection } from '@/contracts/wallets'
import { http, parseResponse } from '@/shared/api/http'

export async function fetchWallets(signal?: AbortSignal): Promise<Wallet[]> {
  return parseResponse(walletListSchema, (await http.get('/wallets', { signal })).data).wallets
}

const connectionPath = (walletId: string) => `/wallets/${encodeURIComponent(walletId)}/connection`

export async function fetchWalletConnection(walletId: string, signal?: AbortSignal): Promise<WalletConnection> {
  return parseResponse(walletConnectionSchema, (await http.get(connectionPath(walletId), { signal })).data)
}

/** Asks the (simulated) wallet app to connect; it may refuse (409 WALLET_REJECTED). */
export async function connectWallet(walletId: string): Promise<WalletConnection> {
  return parseResponse(walletConnectionSchema, (await http.post(connectionPath(walletId))).data)
}

export async function disconnectWallet(walletId: string): Promise<WalletConnection> {
  return parseResponse(walletConnectionSchema, (await http.delete(connectionPath(walletId))).data)
}
