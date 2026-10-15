import { toSocketIo } from '@mswjs/socket.io-binding'
import { ws, type WebSocketHandlerConnection } from 'msw'
import type { EventEnvelope } from '@/contracts/events'

/**
 * Must match the `pingInterval` that @mswjs/socket.io-binding@0.2.0 announces in its
 * engine.io handshake. The binding never sends pings, and socket.io-client closes the
 * connection ("ping timeout") after pingInterval + pingTimeout without one.
 */
const ENGINE_IO_PING_INTERVAL_MS = 25_000
const ENGINE_IO_PING_PACKET = '2'

/**
 * msw@2.15 strips the `/socket.io/` path prefix and the query string from the client
 * URL before matching, so the Socket.IO endpoint (`${origin}/socket.io/?EIO=4&...`)
 * matches a handler declared for the bare origin. Declaring the handler with the
 * `/socket.io/` path makes the connection fall through to the real network.
 */
export const realtime = ws.link(window.location.origin.replace(/^http/, 'ws'))

type SocketIoConnection = ReturnType<typeof toSocketIo>

interface ActiveConnection {
  id: string
  raw: WebSocketHandlerConnection
  io: SocketIoConnection
}

const activeConnections = new Map<string, ActiveConnection>()

export function getActiveConnectionCount(): number {
  return activeConnections.size
}

/** Server-side close of every active connection, as a dropped network would do. */
export function closeAllConnections(): number {
  const closed = activeConnections.size
  for (const connection of activeConnections.values()) {
    connection.raw.client.close()
  }
  return closed
}

function envelope<TType extends string, TPayload>(
  type: TType,
  resource: EventEnvelope<TType, TPayload>['resource'],
  payload: TPayload,
): EventEnvelope<TType, TPayload> {
  return {
    eventId: crypto.randomUUID(),
    type,
    resource,
    version: 1,
    occurredAt: new Date().toISOString(),
    payload,
  }
}

export const socketHandlers = [
  realtime.addEventListener('connection', (raw) => {
    const io = toSocketIo(raw)
    const connection: ActiveConnection = { id: raw.client.id, raw, io }
    activeConnections.set(connection.id, connection)

    const heartbeat = setInterval(() => {
      raw.client.send(ENGINE_IO_PING_PACKET)
    }, ENGINE_IO_PING_INTERVAL_MS)

    raw.client.addEventListener('close', () => {
      clearInterval(heartbeat)
      activeConnections.delete(connection.id)
    })

    io.client.on('system.ping', (_event, payload: { echo: string }) => {
      io.client.emit(
        'system.pong',
        envelope('system.pong', { kind: 'connection', id: connection.id }, payload),
      )
    })

    // The binding sends the engine.io OPEN and Socket.IO CONNECT packets in a microtask;
    // application events must only be emitted after them.
    setTimeout(() => {
      io.client.emit(
        'system.hello',
        envelope('system.hello', { kind: 'connection', id: connection.id }, {
          connectionId: connection.id,
        }),
      )
    }, 0)
  }),
]
