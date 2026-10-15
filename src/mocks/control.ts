import { http, HttpResponse } from 'msw'
import { z } from 'zod'
import { displayNameSchema } from '@/contracts/account'
import {
  emitTestEventRequestSchema,
  mockScenarioSchema,
  type MockState,
} from '@/contracts/mock'
import { profileUpdatedEvent, updateDisplayName } from './api/account'
import { apiError, readJson, validationError } from './api/respond'
import { isSessionActive } from './api/session'
import { getStorageStatus, readDb, resetDb, transaction } from './db/database'
import { SEED_VERSION } from './db/seed'
import { persistedDbBytes } from './db/storage'
import { getScenario, resetScenario, setScenario } from './scenarios'
import {
  closeAllConnections,
  emitToAll,
  emitToUser,
  getActiveConnectionCount,
  listConnections,
} from './socket'

/**
 * Mock control API. It lives on the network layer so that tests and the demo panel
 * drive the simulation through MSW, never by touching app state directly.
 * It is registered only when the mocks are enabled (VITE_ENABLE_MOCKS=true).
 */

async function buildState(): Promise<MockState> {
  const storage = { status: await getStorageStatus(), bytes: persistedDbBytes() }
  const socket = { connections: listConnections() }
  if (storage.status === 'corrupted') {
    return {
      seedVersion: SEED_VERSION,
      scenario: getScenario(),
      storage,
      counts: { users: 0, activeSessions: 0, nfts: 0, collections: 0, wallets: 0 },
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

  /** Restores the seed and the default scenario, and drops every socket connection. */
  http.post('/__mock/reset', async () => {
    await resetDb()
    resetScenario()
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

  http.get('/__mock/socket/connections', () => HttpResponse.json({ connections: listConnections() })),

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
