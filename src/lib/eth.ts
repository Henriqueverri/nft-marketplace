/**
 * ETH arithmetic in wei (bigint). Amounts cross the network as decimal strings and
 * are never converted to floating point, so 0.1 * 3 is exactly 0.3.
 * Shared by the app and the mocks.
 */

const WEI_DECIMALS = 18
const WEI_PER_ETH = 10n ** BigInt(WEI_DECIMALS)
const ETH_PATTERN = /^(0|[1-9]\d*)(?:\.(\d{1,18}))?$/

export function parseEth(amount: string): bigint {
  const match = ETH_PATTERN.exec(amount)
  if (!match) throw new Error(`Invalid ETH amount: "${amount}"`)
  const [, whole, fraction = ''] = match
  return BigInt(whole) * WEI_PER_ETH + BigInt(fraction.padEnd(WEI_DECIMALS, '0'))
}

/** Shortest decimal representation, without trailing zeros (e.g. "1.5", "0.3", "2"). */
export function formatEth(wei: bigint): string {
  if (wei < 0n) throw new Error('Negative ETH amounts are not supported')
  const whole = wei / WEI_PER_ETH
  const fraction = (wei % WEI_PER_ETH).toString().padStart(WEI_DECIMALS, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

/**
 * Display form of the Figma ("1.19", "0.10", "2.00"): at least two decimals, never
 * rounded, so a price with more digits is shown in full.
 */
export function formatEthDisplay(amount: string): string {
  const [whole, fraction = ''] = formatEth(parseEth(amount)).split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

export function minEth(amounts: readonly string[]): string {
  if (amounts.length === 0) throw new Error('minEth needs at least one amount')
  return formatEth(amounts.map(parseEth).reduce((min, wei) => (wei < min ? wei : min)))
}
