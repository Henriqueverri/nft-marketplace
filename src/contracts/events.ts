/**
 * Socket.IO event contracts shared by the app, the MSW mocks and the E2E tests.
 * Every server event carries a stable identity, the affected resource and a version.
 */

export const SOCKET_PATH = '/socket.io/'

export interface EventEnvelope<TType extends string, TPayload> {
  eventId: string
  type: TType
  resource: { kind: string; id: string }
  version: number
  occurredAt: string
  userId?: string
  payload: TPayload
}

export type SystemHelloEvent = EventEnvelope<'system.hello', { connectionId: string }>

export type SystemPongEvent = EventEnvelope<'system.pong', { echo: string }>

export interface ServerToClientEvents {
  'system.hello': (event: SystemHelloEvent) => void
  'system.pong': (event: SystemPongEvent) => void
}

export interface ClientToServerEvents {
  'system.ping': (payload: { echo: string }) => void
}

export type ServerEventName = keyof ServerToClientEvents
