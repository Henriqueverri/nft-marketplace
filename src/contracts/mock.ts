import { z } from 'zod'
import { userIdSchema } from './common'

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
  socket: z.object({ connections: z.array(socketConnectionInfoSchema) }),
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
