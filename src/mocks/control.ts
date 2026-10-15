import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import { displayNameSchema } from '@/contracts/account'
import { userIdSchema } from '@/contracts/common'
import {
  disconnectWalletsRequestSchema,
  emitTestEventRequestSchema,
  mockScenarioSchema,
  queueDelaysRequestSchema,
  replayNftEventRequestSchema,
  replayOrderEventRequestSchema,
  resolveOrderRequestSchema,
  socketBlockRequestSchema,
  updateNftRequestSchema,
  type MockState,
} from '@/contracts/mock'
import { profileUpdatedEvent, updateDisplayName } from './api/account'
import { clearRecordedQuotes, getRecordedQuote, summarizeCarts } from './api/cart'
import { clearOrderTimers, replayOrderEvent, resolveOrder, summarizeOrders } from './api/orders'
import { disconnectWallets } from './api/wallets'
import { apiError, readJson, validationError } from './api/respond'
import { isSessionActive } from './api/session'
import { getStorageStatus, readDb, resetDb, transaction } from './db/database'
import { SEED_VERSION } from './db/seed'
import { persistedDbBytes } from './db/storage'
import { getNetworkActivity, queueDelays, resetNetwork } from './network'
import { clearNftEventHistory, replayNftEvent, updateNft } from './nft-updates'
import { getScenario, resetScenario, setScenario } from './scenarios'
import {
  closeAllConnections,
  emitToAll,
  emitToUser,
  getActiveConnectionCount,
  getRefusedConnectionCount,
  isSocketBlocked,
  listConnections,
  setSocketBlocked,
} from './socket'

/**
 * Mock control API. It lives on the network layer so that tests and the demo panel
 * drive the simulation through MSW, never by touching app state directly.
 * It is registered only when the mocks are enabled (VITE_ENABLE_MOCKS=true).
 */

async function buildState(): Promise<MockState> {
  const storage = { status: await getStorageStatus(), bytes: persistedDbBytes() }
  const socket = { connections: listConnections(), blocked: isSocketBlocked() }
  if (storage.status === 'corrupted') {
    return {
      seedVersion: SEED_VERSION,
      scenario: getScenario(),
      storage,
      counts: { users: 0, activeSessions: 0, nfts: 0, collections: 0, wallets: 0, favorites: 0, carts: 0, orders: 0 },
      users: [],
      socket,
    }
  }
  const db = await readDb()
  const activeSessions = db.sessions.filter((session) => isSessionActive(db, session.id))
  return {
    seedVersion: db.seedVersion,
    scenario: getScenario(),
    storage,
    counts: {
      users: db.users.length,
      activeSessions: activeSessions.length,
      nfts: db.nfts.length,
      collections: db.collections.length,
      wallets: Object.values(db.walletsByUser).reduce((total, wallets) => total + wallets.length, 0),
      favorites: Object.values(db.favoritesByUser).reduce((total, favorites) => total + favorites.length, 0),
      carts: Object.keys(db.cartsByUser).length + Object.keys(db.guestCarts).length,
      orders: db.orders.length,
    },
    users: db.users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      activeSessions: activeSessions.filter((session) => session.userId === user.id).length,
    })),
    socket,
  }
}

const expireRequestSchema = z.object({ userId: z.string().optional() }).optional()

export const controlHandlers = [
  http.get('/__mock/status', () =>
    HttpResponse.json({ mocks: true, socketConnections: getActiveConnectionCount() }),
  ),

  http.get('/__mock/state', async () => HttpResponse.json(await buildState())),

  http.get('/__mock/scenario', () => HttpResponse.json(getScenario())),

  http.put('/__mock/scenario', async ({ request }) => {
    const parsed = mockScenarioSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    return HttpResponse.json(setScenario(parsed.data))
  }),

  /**
   * Restores the seed and the default scenario, unblocks the socket server and drops
   * every connection, queued delay, request log entry and replayable event.
   */
  http.post('/__mock/reset', async () => {
    await resetDb()
    resetScenario()
    resetNetwork()
    clearNftEventHistory()
    clearRecordedQuotes()
    clearOrderTimers()
    disconnectWallets()
    setSocketBlocked(false)
    closeAllConnections()
    return HttpResponse.json(await buildState())
  }),

  /** Makes active sessions expire now; the next private request gets a real 401. */
  http.post('/__mock/session/expire', async ({ request }) => {
    const parsed = expireRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    const userId = parsed.data?.userId
    const now = Date.now()
    const expired = await transaction((draft) => {
      let count = 0
      for (const session of draft.sessions) {
        if (userId && session.userId !== userId) continue
        if (!isSessionActive(draft, session.id)) continue
        session.expiresAt = new Date(now - 1000).toISOString()
        count++
      }
      return count
    })
    return HttpResponse.json({ expired })
  }),

  http.post('/__mock/socket/disconnect', () => HttpResponse.json({ closed: closeAllConnections() })),

  http.get('/__mock/socket/connections', () =>
    HttpResponse.json({ connections: listConnections(), refusedWhileBlocked: getRefusedConnectionCount() }),
  ),

  /** While blocked the realtime server is unreachable: connections drop and retries fail. */
  http.post('/__mock/socket/block', async ({ request }) => {
    const parsed = socketBlockRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    return HttpResponse.json({ blocked: parsed.data.blocked, closed: setSocketBlocked(parsed.data.blocked) })
  }),

  http.post('/__mock/network/delays', async ({ request }) => {
    const parsed = queueDelaysRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    return HttpResponse.json({ queued: queueDelays(parsed.data) })
  }),

  http.get('/__mock/network/activity', () => HttpResponse.json(getNetworkActivity())),

  /** Price or stock change made on the server: persisted, then `nft.updated` to everyone. */
  http.post('/__mock/nfts/:nftId/update', async ({ params, request }) => {
    const parsed = updateNftRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    const result = await updateNft(String(params.nftId), parsed.data)
    if (!result.ok) {
      return result.status === 'not-found'
        ? apiError('NOT_FOUND', result.message)
        : apiError('VALIDATION_FAILED', result.message)
    }
    return HttpResponse.json({
      eventId: result.event.eventId,
      version: result.event.version,
      delivered: result.delivered,
    })
  }),

  http.post('/__mock/nfts/:nftId/replay', async ({ params, request }) => {
    const parsed = replayNftEventRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    const result = replayNftEvent(String(params.nftId), parsed.data.kind)
    if (!result.ok) return apiError('CONFLICT', result.message)
    return HttpResponse.json({
      eventId: result.event.eventId,
      version: result.event.version,
      delivered: result.delivered,
    })
  }),

  /** Persisted favorites of any user, to verify isolation from outside the app. */
  http.get('/__mock/users/:userId/favorites', async ({ params }) => {
    const parsed = userIdSchema.safeParse(params.userId)
    if (!parsed.success) return validationError(parsed.error)
    const db = await readDb()
    if (!db.users.some((user) => user.id === parsed.data)) return apiError('NOT_FOUND', 'Usuário inexistente.')
    return HttpResponse.json({ nftIds: (db.favoritesByUser[parsed.data] ?? []).map((favorite) => favorite.nftId) })
  }),

  /** Every persisted cart (accounts and visitors), to check server state from outside the app. */
  http.get('/__mock/carts', async () => HttpResponse.json(summarizeCarts(await readDb()))),

  /** Every persisted order (any user), to count and inspect them from outside the app. */
  http.get('/__mock/orders', async () => HttpResponse.json({ orders: summarizeOrders(await readDb()) })),

  /** Settles a pending order now; a confirmed or rejected order keeps its status (409). */
  http.post('/__mock/orders/:orderId/resolve', async ({ params, request }) => {
    const parsed = resolveOrderRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    const result = await resolveOrder(String(params.orderId), parsed.data.outcome)
    if (!result) return apiError('NOT_FOUND', 'Pedido não encontrado.')
    if (!result.settled) return apiError('CONFLICT', `O pedido já está ${result.order.status === 'confirmed' ? 'confirmado' : 'recusado'}.`)
    return HttpResponse.json(result.order)
  }),

  /** Re-sends an order's last `order.updated` (duplicate) or the one before it (stale). */
  http.post('/__mock/orders/:orderId/replay', async ({ params, request }) => {
    const parsed = replayOrderEventRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    const result = await replayOrderEvent(String(params.orderId), parsed.data.kind, parsed.data.delivery)
    if (!result.ok) return apiError('CONFLICT', result.message)
    return HttpResponse.json({ eventId: result.event.eventId, version: result.event.version, delivered: result.delivered })
  }),

  /** The wallet app drops its connections (as if the user disconnected it there). */
  http.post('/__mock/wallets/disconnect', async ({ request }) => {
    const parsed = disconnectWalletsRequestSchema.safeParse(await readJson(request))
    if (!parsed.success) return validationError(parsed.error)
    return HttpResponse.json({ disconnected: disconnectWallets(parsed.data?.userId) })
  }),

  /** A quote exactly as POST /api/quotes sent it (the last 50 are kept in memory). */
  http.get('/__mock/quotes/:quoteId', ({ params }) => {
    const quote = getRecordedQuote(String(params.quoteId))
    return quote ? HttpResponse.json(quote) : apiError('NOT_FOUND', 'Cotação não registrada.')
  }),

  /**
   * Server-side profile change, as if made from another device: the database is
   * updated (REST reflects it) and `profile.updated` is emitted. With
   * `delivery: 'broadcast'` the event goes to every connection, simulating a routing
   * bug, to prove that the client drops events of other users.
   */
  http.post('/__mock/users/:userId/profile', async ({ params, request }) => {
    const parsed = emitTestEventRequestSchema
      .extend({ displayName: displayNameSchema })
      .safeParse({ ...(await readJson(request) as object), userId: params.userId })
    if (!parsed.success) return validationError(parsed.error)

    const db = await readDb()
    if (!db.users.some((user) => user.id === parsed.data.userId)) {
      return apiError('NOT_FOUND', 'Usuário inexistente.')
    }
    const profile = await updateDisplayName(parsed.data.userId, parsed.data.displayName)
    const event = profileUpdatedEvent(profile)
    const delivered =
      parsed.data.delivery === 'broadcast'
        ? emitToAll('profile.updated', event)
        : await emitToUser(profile.id, 'profile.updated', event)
    return HttpResponse.json({ delivered })
  }),
]
