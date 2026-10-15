import type { Nft } from '@/contracts/catalog'
import type { NftUpdatedEvent } from '@/contracts/events'
import type { UpdateNftRequest } from '@/contracts/mock'
import { formatEth, minEth, parseEth } from '@/lib/eth'
import { nftUpdatedEvent } from './api/catalog'
import { readDb, transaction } from './db/database'
import { emitToAll } from './socket'

/**
 * Server-side NFT changes (as if made by the seller) and the `nft.updated` events
 * they emit. The database is written first, so REST and the event always agree.
 */

/** Last two events per NFT, kept to replay a duplicate or a stale event in tests. */
const history = new Map<string, NftUpdatedEvent[]>()

export function clearNftEventHistory(): void {
  history.clear()
}

export type NftUpdateResult =
  | { ok: true; nft: Nft; event: NftUpdatedEvent; delivered: number }
  | { ok: false; status: 'not-found' | 'invalid'; message: string }

export async function updateNft(nftId: string, change: UpdateNftRequest): Promise<NftUpdateResult> {
  const db = await readDb()
  const current = db.nfts.find((nft) => nft.id === nftId)
  if (!current) return { ok: false, status: 'not-found', message: 'NFT não encontrado.' }
  for (const [editionId, available] of Object.entries(change.available ?? {})) {
    const edition = current.editions.find((candidate) => candidate.id === editionId)
    if (!edition) return { ok: false, status: 'invalid', message: `Edição inexistente: ${editionId}.` }
    if (available > edition.supply) return { ok: false, status: 'invalid', message: `Estoque acima da tiragem: ${editionId}.` }
  }

  const nft = await transaction((draft) => {
    const target = draft.nfts.find((candidate) => candidate.id === nftId)!
    if (change.priceEth !== undefined) {
      // Every edition moves by the same delta, so the cheapest one gets the new price.
      const delta = parseEth(change.priceEth) - parseEth(target.priceEth)
      for (const edition of target.editions) edition.priceEth = formatEth(parseEth(edition.priceEth) + delta)
    }
    for (const edition of target.editions) {
      const available = change.available?.[edition.id]
      if (available !== undefined) edition.available = available
    }
    target.priceEth = minEth(target.editions.map((edition) => edition.priceEth))
    if (target.compareAtPriceEth !== null && parseEth(target.compareAtPriceEth) <= parseEth(target.priceEth)) {
      target.compareAtPriceEth = null
    }
    target.version += 1
    return target
  })

  const event = nftUpdatedEvent(nft)
  history.set(nftId, [...(history.get(nftId) ?? []), event].slice(-2))
  return { ok: true, nft, event, delivered: emitToAll('nft.updated', event) }
}

/**
 * `duplicate` re-sends the last event as is (same eventId). `stale` sends the
 * previous state under a new eventId, as a delayed message would arrive.
 */
export function replayNftEvent(
  nftId: string,
  kind: 'duplicate' | 'stale',
): { ok: true; event: NftUpdatedEvent; delivered: number } | { ok: false; message: string } {
  const events = history.get(nftId) ?? []
  const last = events.at(-1)
  if (!last) return { ok: false, message: 'Nenhum evento emitido para este NFT ainda.' }
  let event: NftUpdatedEvent = last
  if (kind === 'stale') {
    const previous = events.length > 1 ? events[0] : null
    if (!previous) return { ok: false, message: 'É preciso emitir duas atualizações antes de um evento antigo.' }
    event = { ...previous, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString() }
  }
  return { ok: true, event, delivered: emitToAll('nft.updated', event) }
}
