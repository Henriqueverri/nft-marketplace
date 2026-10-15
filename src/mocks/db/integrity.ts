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

  return problems
}
