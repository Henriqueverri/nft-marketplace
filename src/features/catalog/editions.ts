import type { Edition, NftDetail } from '@/contracts/catalog'
import { formatEth, formatEthDisplay, parseEth } from '@/lib/eth'

/** Default edition: the cheapest one still available (the price shown on cards). */
export function defaultEdition(nft: NftDetail): Edition {
  const available = nft.editions.filter((edition) => edition.available > 0)
  const pool = available.length ? available : nft.editions
  return pool.reduce((best, edition) => (parseEth(edition.priceEth) < parseEth(best.priceEth) ? edition : best))
}

export function maxQuantity(edition: Edition): number {
  return Math.min(edition.maxPerOrder, edition.available)
}

export function totalPrice(edition: Edition, quantity: number): string {
  return formatEthDisplay(formatEth(parseEth(edition.priceEth) * BigInt(Math.max(quantity, 1))))
}
