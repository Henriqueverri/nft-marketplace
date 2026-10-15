import { createContext, useContext, useEffect, useRef } from 'react'
import type { ServerToClientEvents, SystemHelloEvent } from '@/contracts/events'

/**
 * `rejected`: the server refused the token (CONNECT_ERROR).
 * `unavailable`: the realtime client itself could not be loaded; there is no socket.
 */
export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'rejected'
  | 'unavailable'

/** Status of the socket of the current session (reset when the session changes). */
export interface RealtimeStatus {
  state: RealtimeConnectionState
  connectCount: number
  disconnectCount: number
  lastDisconnectReason: string | null
  lastHello: SystemHelloEvent | null
  /** Domain events delivered to at least one subscriber. */
  eventsApplied: number
  /** Duplicates and private events addressed to another user, dropped on arrival. */
  eventsIgnored: number
}

export const initialRealtimeStatus: RealtimeStatus = {
  state: 'idle',
  connectCount: 0,
  disconnectCount: 0,
  lastDisconnectReason: null,
  lastHello: null,
  eventsApplied: 0,
  eventsIgnored: 0,
}

export const RealtimeStatusContext = createContext<RealtimeStatus>(initialRealtimeStatus)

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeStatusContext)
}

/** Starts a new attempt to load the client and connect, after `unavailable`. */
export const RealtimeRetryContext = createContext<() => void>(() => {})

export function useRealtimeRetry(): () => void {
  return useContext(RealtimeRetryContext)
}

export type DomainEventName = Exclude<keyof ServerToClientEvents, 'system.hello' | 'system.pong'>
export type DomainEvent<E extends DomainEventName> = Parameters<ServerToClientEvents[E]>[0]

export interface RealtimeSubscriptions {
  subscribe<E extends DomainEventName>(event: E, handler: (payload: DomainEvent<E>) => void): () => void
  /** Number of live subscriptions, shown in the demo panel. */
  count: number
}

export const RealtimeSubscriptionsContext = createContext<RealtimeSubscriptions>({
  subscribe: () => () => {},
  count: 0,
})

export function useRealtimeSubscriptionCount(): number {
  return useContext(RealtimeSubscriptionsContext).count
}

/**
 * Subscribes to a domain event for the lifetime of the calling component. The
 * subscription is released on unmount; the handler may change between renders.
 */
export function useRealtimeEvent<E extends DomainEventName>(
  event: E,
  handler: (payload: DomainEvent<E>) => void,
): void {
  const { subscribe } = useContext(RealtimeSubscriptionsContext)
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  useEffect(() => subscribe(event, (payload) => handlerRef.current(payload)), [event, subscribe])
}
