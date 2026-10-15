import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { sessionQueryKey } from '@/shared/session/query-keys'
import { sessionStore } from '@/shared/session/session-store'
import {
  initialRealtimeStatus,
  RealtimeRetryContext,
  RealtimeStatusContext,
  RealtimeSubscriptionsContext,
  type DomainEventName,
  type RealtimeStatus,
} from './context'
import { createRealtimeSocket, type RealtimeSocket } from './socket'

type Handler = (payload: never) => void

const SEEN_EVENT_IDS_LIMIT = 500

function isDomainEvent(value: unknown): value is { eventId: string; userId?: string } {
  return typeof value === 'object' && value !== null && typeof (value as { eventId?: unknown }).eventId === 'string'
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot)
  const [attempt, setAttempt] = useState(0)
  // Tagged with the session epoch and the attempt: a status left by a previous
  // session or attempt reads as initial.
  const runKey = `${session.epoch}:${attempt}`
  const [tagged, setTagged] = useState<{ runKey: string; status: RealtimeStatus }>({
    runKey,
    status: initialRealtimeStatus,
  })
  const status = tagged.runKey === runKey ? tagged.status : initialRealtimeStatus
  const retry = useCallback(() => setAttempt((current) => current + 1), [])
  const handlers = useRef(new Map<string, Set<Handler>>())
  const [subscriptionCount, setSubscriptionCount] = useState(0)

  const subscribe = useCallback((event: DomainEventName, handler: Handler) => {
    const set = handlers.current.get(event) ?? new Set<Handler>()
    handlers.current.set(event, set)
    set.add(handler)
    setSubscriptionCount((count) => count + 1)
    return () => {
      if (set.delete(handler)) setSubscriptionCount((count) => count - 1)
    }
  }, [])

  // One socket per session epoch. The token and owner are fixed for its whole life.
  const { epoch, token, userId } = session
  useEffect(() => {
    let socket: RealtimeSocket | null = null
    let disposed = false
    const currentRunKey = `${epoch}:${attempt}`
    const seenEventIds = new Set<string>()
    // Set by a drop or a failed attempt; the next connection must reconcile with REST.
    let missedEvents = false
    const setStatus = (update: (current: RealtimeStatus) => RealtimeStatus) =>
      setTagged((current) => ({
        runKey: currentRunKey,
        status: update(current.runKey === currentRunKey ? current.status : initialRealtimeStatus),
      }))

    void createRealtimeSocket(token).then((created) => {
      if (disposed) return
      socket = created

      socket.on('connect', () => {
        setStatus((s) => ({
          ...s,
          state: 'connected',
          connectCount: s.connectCount + 1,
          reconciliations: s.reconciliations + (missedEvents ? 1 : 0),
        }))
        if (missedEvents) {
          missedEvents = false
          void queryClient.invalidateQueries({ predicate: (query) => query.meta?.reconcileOnReconnect === true })
        }
      })
      socket.on('disconnect', (reason) => {
        missedEvents = true
        setStatus((s) => ({
          ...s,
          state: 'disconnected',
          disconnectCount: s.disconnectCount + 1,
          lastDisconnectReason: reason,
        }))
      })
      socket.on('connect_error', (error) => {
        missedEvents = true
        if (error.message !== 'UNAUTHENTICATED') {
          // Server unreachable: socket.io-client keeps retrying with backoff.
          setStatus((s) => (s.state === 'connecting' ? { ...s, state: 'disconnected' } : s))
          return
        }
        // The server refused the token: let the REST API confirm it (a 401 there ends
        // the session and a new, anonymous socket replaces this one).
        setStatus((s) => ({ ...s, state: 'rejected' }))
        void queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      })
      socket.on('system.hello', (event) => {
        setStatus((s) => ({ ...s, lastHello: event }))
      })

      socket.onAny((eventName: string, payload: unknown) => {
        if (eventName.startsWith('system.') || !isDomainEvent(payload)) return
        const ownedByAnotherUser = payload.userId !== undefined && payload.userId !== userId
        const duplicate = seenEventIds.has(payload.eventId)
        if (ownedByAnotherUser || duplicate) {
          setStatus((s) => ({ ...s, eventsIgnored: s.eventsIgnored + 1 }))
          return
        }
        seenEventIds.add(payload.eventId)
        if (seenEventIds.size > SEEN_EVENT_IDS_LIMIT) {
          seenEventIds.delete(seenEventIds.values().next().value!)
        }
        const subscribers = handlers.current.get(eventName)
        if (!subscribers?.size) return
        for (const handler of subscribers) (handler as (payload: unknown) => void)(payload)
        setStatus((s) => ({ ...s, eventsApplied: s.eventsApplied + 1 }))
      })

      setStatus((s) => ({ ...s, state: 'connecting' }))
      socket.connect()
    }).catch(() => {
      // The chunk could not be loaded (offline, removed by a new deploy). There is no
      // socket to clean up; the error detail is not shown to the user.
      if (!disposed) setStatus((s) => ({ ...s, state: 'unavailable' }))
    })

    return () => {
      disposed = true
      // Listeners go first so that the intentional disconnect is not reported as a drop.
      socket?.removeAllListeners()
      socket?.offAny()
      socket?.disconnect()
    }
  }, [epoch, attempt, token, userId, queryClient])

  const subscriptions = useMemo(() => ({ subscribe, count: subscriptionCount }), [subscribe, subscriptionCount])

  return (
    <RealtimeStatusContext value={status}>
      <RealtimeRetryContext value={retry}>
        <RealtimeSubscriptionsContext value={subscriptions}>{children}</RealtimeSubscriptionsContext>
      </RealtimeRetryContext>
    </RealtimeStatusContext>
  )
}
