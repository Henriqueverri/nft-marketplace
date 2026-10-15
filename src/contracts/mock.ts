import { z } from 'zod'
import { ethAmountSchema, userIdSchema } from './common'

/**
 * Contracts of the mock control API (/__mock/*). It exists only while the MSW
 * mocks are enabled (development, tests and the public demo build).
 */

export const failureModeSchema = z.enum(['none', 'server-error', 'unavailable', 'offline'])
export type FailureMode = z.infer<typeof failureModeSchema>

/**
 * `unavailable` makes the on-demand realtime client chunk fail to load (network
 * error), as after a deploy that removed the old chunk.
 */
export const realtimeClientModeSchema = z.enum(['available', 'unavailable'])
export type RealtimeClientMode = z.infer<typeof realtimeClientModeSchema>

/**
 * `latencyMs` and `failure` apply to every /api/* request; control endpoints are
 * never delayed or failed. `realtimeClient` applies to the realtime client chunk.
 */
export const mockScenarioSchema = z.object({
  latencyMs: z.number().int().min(0).max(10_000),
  failure: failureModeSchema,
  realtimeClient: realtimeClientModeSchema.default('available'),
})
export type MockScenario = z.infer<typeof mockScenarioSchema>
export type MockScenarioInput = z.input<typeof mockScenarioSchema>

export const DEFAULT_SCENARIO: MockScenario = { latencyMs: 100, failure: 'none', realtimeClient: 'available' }

export const storageStatusSchema = z.enum(['ok', 'corrupted'])

export const socketConnectionInfoSchema = z.object({
  connectionId: z.string(),
  /** null for anonymous connections and before the CONNECT packet is processed. */
  userId: userIdSchema.nullable(),
})
export type SocketConnectionInfo = z.infer<typeof socketConnectionInfoSchema>

/** GET /__mock/state: a summary that never includes credentials or tokens. */
export const mockStateSchema = z.object({
  seedVersion: z.number().int(),
  scenario: mockScenarioSchema,
  storage: z.object({ status: storageStatusSchema, bytes: z.number().int().nonnegative() }),
  counts: z.object({
    users: z.number().int(),
    activeSessions: z.number().int(),
    nfts: z.number().int(),
    collections: z.number().int(),
    wallets: z.number().int(),
    favorites: z.number().int(),
    /** Account and visitor carts persisted on the server. */
    carts: z.number().int(),
  }),
  users: z.array(
    z.object({
      id: userIdSchema,
      username: z.string(),
      email: z.string(),
      displayName: z.string(),
      activeSessions: z.number().int(),
    }),
  ),
  socket: z.object({
    connections: z.array(socketConnectionInfoSchema),
    /** While blocked, the server drops every connection and refuses new ones. */
    blocked: z.boolean(),
  }),
})
export type MockState = z.infer<typeof mockStateSchema>

export const expireSessionsResponseSchema = z.object({ expired: z.number().int() })

export const emitTestEventRequestSchema = z.object({
  /** Owner written in the event envelope. */
  userId: userIdSchema,
  /**
   * `owner` delivers only to the owner's connections (normal routing).
   * `broadcast` delivers to every connection, simulating a server routing bug,
   * so the client-side ownership filter can be proven.
   */
  delivery: z.enum(['owner', 'broadcast']),
  displayName: z.string(),
})
export type EmitTestEventRequest = z.infer<typeof emitTestEventRequestSchema>

export const emitTestEventResponseSchema = z.object({ delivered: z.number().int() })

/**
 * POST /__mock/nfts/:nftId/update: a server-side change (as if made by the seller).
 * `priceEth` sets the lowest edition price and shifts the others by the same delta;
 * `available` sets stock per edition. The NFT version grows and `nft.updated` is
 * emitted to every connection.
 */
export const updateNftRequestSchema = z
  .object({
    priceEth: ethAmountSchema.optional(),
    available: z.record(z.string().regex(/^ed_[a-z0-9-]+$/), z.number().int().nonnegative()).optional(),
  })
  .refine((value) => value.priceEth !== undefined || value.available !== undefined, {
    message: 'Informe priceEth ou available.',
  })
export type UpdateNftRequest = z.infer<typeof updateNftRequestSchema>

export const nftEventResponseSchema = z.object({
  eventId: z.string(),
  version: z.number().int(),
  delivered: z.number().int(),
})
export type NftEventResponse = z.infer<typeof nftEventResponseSchema>

/**
 * POST /__mock/nfts/:nftId/replay: re-emits `nft.updated` without changing data.
 * `duplicate` repeats the last event (same eventId); `stale` sends a new eventId
 * carrying the previous version and an older price.
 */
export const replayNftEventRequestSchema = z.object({ kind: z.enum(['duplicate', 'stale']) })

export const socketBlockRequestSchema = z.object({ blocked: z.boolean() })

/**
 * POST /__mock/network/delays: one-shot delays for the next requests whose path
 * starts with `pathPrefix` (and whose method is `method`, when given), consumed in
 * order before the scenario latency. Used to deliver responses out of order. With
 * `failure`, those requests also fail that way after the delay, whatever the scenario.
 */
export const queueDelaysRequestSchema = z.object({
  pathPrefix: z.string().startsWith('/api/'),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  delaysMs: z.array(z.number().int().min(0).max(10_000)).min(1).max(10),
  failure: failureModeSchema.exclude(['none']).optional(),
  /**
   * `request` (default): the request waits before the handler runs, so its answer
   * reflects the state after the wait. `response`: the handler runs at once and its
   * answer is held, as a slow network delivers an answer about an older state.
   */
  phase: z.enum(['request', 'response']).optional(),
})
export type QueueDelaysRequest = z.infer<typeof queueDelaysRequestSchema>

/**
 * GET /__mock/network/activity: /api/* requests the mock is still handling, and how
 * many it has handled per `METHOD /path?query` since the last reset. Lets tests wait
 * for a delayed response, or prove that no request was made, without fixed sleeps:
 * Playwright cannot observe requests answered by the service worker.
 */
export const networkActivitySchema = z.object({
  inFlight: z.number().int().nonnegative(),
  requests: z.record(z.string(), z.number().int().positive()),
})
export type NetworkActivity = z.infer<typeof networkActivitySchema>

export const userFavoritesResponseSchema = z.object({ nftIds: z.array(z.string()) })
