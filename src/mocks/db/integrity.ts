import { minEth } from '@/lib/eth'
import type { DbState } from './schema'

/**
 * Referential and business invariants of the mock database. Returns the list of
 * violations (empty when consistent). Checked on load and before every write.
 */
export function findIntegrityProblems(state: DbState): string[] {
  const problems: string[] = []
  const userIds = new Set<string>()
  const emails = new Set<string>()
  const usernames = new Set<string>()

  for (const user of state.users) {
    if (userIds.has(user.id)) problems.push(`duplicate user id ${user.id}`)
    if (emails.has(user.email)) problems.push(`duplicate e-mail ${user.email}`)
    if (usernames.has(user.username.toLowerCase())) problems.push(`duplicate username ${user.username}`)
    if (user.email !== user.email.toLowerCase()) problems.push(`e-mail not normalized ${user.email}`)
    userIds.add(user.id)
    emails.add(user.email)
    usernames.add(user.username.toLowerCase())
  }

  const credentialOwners = new Set<string>()
  for (const credential of state.credentials) {
    if (!userIds.has(credential.userId)) problems.push(`credential of unknown user ${credential.userId}`)
    if (credentialOwners.has(credential.userId)) problems.push(`duplicate credential ${credential.userId}`)
    credentialOwners.add(credential.userId)
  }
  for (const id of userIds) {
    if (!credentialOwners.has(id)) problems.push(`user without credential ${id}`)
  }

  const tokenHashes = new Set<string>()
  for (const session of state.sessions) {
    if (!userIds.has(session.userId)) problems.push(`session of unknown user ${session.userId}`)
    if (tokenHashes.has(session.tokenHash)) problems.push(`duplicate session token ${session.id}`)
    tokenHashes.add(session.tokenHash)
  }

  for (const [userId, wallets] of Object.entries(state.walletsByUser)) {
    if (!userIds.has(userId)) problems.push(`wallets of unknown user ${userId}`)
    const slots = wallets.map((wallet) => wallet.slot)
    if (new Set(slots).size !== slots.length) problems.push(`duplicate wallet slot for ${userId}`)
  }

  const collectionIds = new Set(state.collections.map((collection) => collection.id))
  const networkIds = new Set(state.networks.map((network) => network.id))
  const nftIds = new Set<string>()
  for (const nft of state.nfts) {
    if (nftIds.has(nft.id)) problems.push(`duplicate nft ${nft.id}`)
    nftIds.add(nft.id)
    if (!collectionIds.has(nft.collectionId)) problems.push(`nft ${nft.id} has unknown collection`)
    if (!networkIds.has(nft.networkId)) problems.push(`nft ${nft.id} has unknown network`)
    for (const edition of nft.editions) {
      if (edition.available > edition.supply) problems.push(`edition ${edition.id} over supply`)
    }
    if (nft.priceEth !== minEth(nft.editions.map((edition) => edition.priceEth))) {
      problems.push(`nft ${nft.id} price differs from its cheapest edition`)
    }
  }

  for (const id of [...state.highlights.slideIds, state.highlights.spotlightId]) {
    if (!nftIds.has(id)) problems.push(`highlight of unknown nft ${id}`)
  }

  const reviewIds = new Set<string>()
  for (const review of state.reviews) {
    if (reviewIds.has(review.id)) problems.push(`duplicate review ${review.id}`)
    reviewIds.add(review.id)
    if (!nftIds.has(review.nftId)) problems.push(`review ${review.id} of unknown nft`)
  }

  for (const [nftId, recommended] of Object.entries(state.recommendations)) {
    if (!nftIds.has(nftId)) problems.push(`recommendations of unknown nft ${nftId}`)
    for (const id of recommended) {
      if (!nftIds.has(id) || id === nftId) problems.push(`invalid recommendation ${id} for ${nftId}`)
    }
  }

  for (const [userId, favorites] of Object.entries(state.favoritesByUser)) {
    if (!userIds.has(userId)) problems.push(`favorites of unknown user ${userId}`)
    const favoriteIds = favorites.map((favorite) => favorite.nftId)
    if (new Set(favoriteIds).size !== favoriteIds.length) problems.push(`duplicate favorite for ${userId}`)
    for (const id of favoriteIds) {
      if (!nftIds.has(id)) problems.push(`favorite of unknown nft ${id} for ${userId}`)
    }
  }

  const editionOwners = new Map(state.nfts.flatMap((nft) => nft.editions.map((edition) => [edition.id, nft.id])))
  const checkCart = (label: string, cart: DbState['guestCarts'][string]) => {
    const lineIds = cart.lines.map((line) => line.editionId)
    if (new Set(lineIds).size !== lineIds.length) problems.push(`duplicate cart line in ${label}`)
    for (const line of cart.lines) {
      if (editionOwners.get(line.editionId) !== line.nftId) problems.push(`cart ${label} has unknown edition ${line.editionId}`)
    }
  }
  for (const [userId, cart] of Object.entries(state.cartsByUser)) {
    if (!userIds.has(userId)) problems.push(`cart of unknown user ${userId}`)
    checkCart(userId, cart)
  }
  for (const [cartId, cart] of Object.entries(state.guestCarts)) {
    checkCart(cartId, cart)
    if (cartId in state.mergedGuestCarts) problems.push(`visitor cart ${cartId} exists after being merged`)
  }

  const couponCodes = state.coupons.map((coupon) => coupon.code)
  if (new Set(couponCodes).size !== couponCodes.length) problems.push('duplicate coupon code')

  const orderIds = new Set<string>()
  const idempotencyKeys = new Set<string>()
  for (const record of state.orders) {
    const { order } = record
    if (orderIds.has(order.orderId)) problems.push(`duplicate order ${order.orderId}`)
    orderIds.add(order.orderId)
    if (!userIds.has(record.userId)) problems.push(`order ${order.orderId} of unknown user`)
    const key = `${record.userId} ${record.idempotencyKey}`
    if (idempotencyKeys.has(key)) problems.push(`idempotency key reused by order ${order.orderId}`)
    idempotencyKeys.add(key)
    const settled = order.status !== 'pending'
    if (settled !== (order.settledAt !== null)) problems.push(`order ${order.orderId} settledAt does not match its status`)
    if ((order.status === 'rejected') !== (order.rejection !== null)) problems.push(`order ${order.orderId} rejection does not match its status`)
  }

  for (const [userId, quotes] of Object.entries(state.issuedQuotes)) {
    if (!userIds.has(userId)) problems.push(`quotes of unknown user ${userId}`)
    for (const { quote, orderId } of quotes) {
      if (orderId && !orderIds.has(orderId)) problems.push(`quote ${quote.quoteId} used by unknown order ${orderId}`)
    }
  }

  return problems
}
