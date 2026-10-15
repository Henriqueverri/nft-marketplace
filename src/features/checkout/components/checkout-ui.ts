import type { NetworkId } from '@/contracts/catalog'
import type { WalletSlot } from '@/contracts/wallets'

export const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

export const NETWORK_NAMES: Record<NetworkId, string> = {
  ethereum: 'Ethereum',
  polygon: 'Polygon',
  solana: 'Solana',
}

/** Figma "Carteiras": the primary wallet and the backup ("Reserva"). */
export const SLOT_NAMES: Record<WalletSlot, string> = {
  primary: 'Principal',
  secondary: 'Reserva',
}
