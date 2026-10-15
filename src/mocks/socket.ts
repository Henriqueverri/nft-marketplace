import { toSocketIo } from '@mswjs/socket.io-binding'
import { ws, type WebSocketHandlerConnection } from 'msw'
import type { EventEnvelope, ServerToClientEvents, SocketAuthError } from '@/contracts/events'
import type { SocketConnectionInfo } from '@/contracts/mock'
import { isSessionActive, lookupSession } from './api/session'
import { readDb } from './db/database'

/**
 * Must match the `pingInterval` that @mswjs/socket.io-binding@0.2.0 announces in its
 * engine.io handshake. The binding never sends pings, and socket.io-client closes the
 * connection ("ping timeout") after pingInterval + pingTimeout without one.
 */
const ENGINE_IO_PING_INTERVAL_MS = 25_000
const ENGINE_IO_PING_PACKET = '2'

/**
 * Any frame whose first character is not an engine.io packet type (0-6, or "b" for
 * base64) is decoded by engine.io-parser@5 as its "parser error" packet, and
 * engine.io-client@6 handles that packet by failing the transport with "server
 * error". socket.io-client then reports `connect_error` and retries with its backoff,
 * as for an unreachable server.
 */
const ENGINE_IO_INVALID_PACKET = 'x'
/** Fallback close, in case a client does not drop the transport on that error. */
const REFUSED_CONNECTION_CLOSE_MS = 1_000

/** engine.io MESSAGE (4) + Socket.IO CONNECT (0) / CONNECT_ERROR (4) packet prefixes. */
const SOCKET_IO_CONNECT_PREFIX = '40'
const SOCKET_IO_CONNECT_ERROR_PREFIX = '44'

/**
 * msw@2.15 strips the `/socket.io/` path prefix and the query string from the client
 * URL before matching, so the Socket.IO endpoint (`${origin}/socket.io/?EIO=4&...`)
 * matches a handler declared for the bare origin. Declaring the handler with the
 * `/socket.io/` path makes the connection fall through to the real network.
 */
export const realtime = ws.link(window.location.origin.replace(/^http/, 'ws'))

type SocketIoConnection = ReturnType<typeof toSocketIo>

/**
 * The binding answers every client with the same engine.io/Socket.IO sid ("test"),
 * so connections are identified by the id MSW gives each WebSocket instead.
 */
interface ActiveConnection {
  id: string
  raw: WebSocketHandlerConnection
  io: SocketIoConnection
  /** Bound when the CONNECT packet carries a valid session token. */
  userId: string | null
  sessionId: string | null
}

const activeConnections = new Map<string, ActiveConnection>()

/** While blocked, every connection is dropped and new ones are refused at once. */
let blocked = false
/** Connection attempts refused since the server was last blocked. */
let refusedConnections = 0

export function isSocketBlocked(): boolean {
  return blocked
}

export function setSocketBlocked(value: boolean): number {
  blocked = value
  if (!value) return 0
  refusedConnections = 0
  return closeAllConnections()
}

export function getRefusedConnectionCount(): number {
  return refusedConnections
}

/**
 * Fails the handshake the way an unreachable server does, through MSW's public
 * client API only: the engine.io OPEN packet is never sent, and an invalid frame
 * makes the client fail the attempt at once. A clean close alone would leave
 * socket.io-client waiting for its 20 s connect timeout before retrying.
 */
function refuseConnection(raw: WebSocketHandlerConnection): void {
  refusedConnections++
  raw.client.send(ENGINE_IO_INVALID_PACKET)
  setTimeout(() => raw.client.close(), REFUSED_CONNECTION_CLOSE_MS)
}

export function getActiveConnectionCount(): number {
  return activeConnections.size
}

export function listConnections(): SocketConnectionInfo[] {
  return [...activeConnections.values()].map((connection) => ({
    connectionId: connection.id,
    userId: connection.userId,
  }))
}

/** Server-side close of every active connection, as a dropped network would do. */
export function closeAllConnections(): number {
  const closed = activeConnections.size
  for (const connection of activeConnections.values()) connection.raw.client.close()
  return closed
}

/** Closes the connections authenticated with a session that was just revoked. */
export function closeSessionConnections(sessionId: string): number {
  let closed = 0
  for (const connection of activeConnections.values()) {
    if (connection.sessionId === sessionId) {
      connection.raw.client.close()
      closed++
    }
  }
  return closed
}

export function createEnvelope<TType extends string, TPayload>(
  type: TType,
  resource: EventEnvelope<TType, TPayload>['resource'],
  version: number,
  payload: TPayload,
  userId?: string,
): EventEnvelope<TType, TPayload> {
  return {
    eventId: crypto.randomUUID(),
    type,
    resource,
    version,
    occurredAt: new Date().toISOString(),
    ...(userId ? { userId } : {}),
    payload,
  }
}

type EventArgs<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>

function emit<E extends keyof ServerToClientEvents>(
  connection: ActiveConnection,
  event: E,
  ...args: EventArgs<E>
): void {
  connection.io.client.emit(event, ...args)
}

/**
 * Delivers a private event only to connections bound to `userId` whose session is
 * still active (an expired or revoked session stops receiving private events at once).
 */
export async function emitToUser<E extends keyof ServerToClientEvents>(
  userId: string,
  event: E,
  ...args: EventArgs<E>
): Promise<number> {
  const db = await readDb()
  let delivered = 0
  for (const connection of activeConnections.values()) {
    if (connection.userId !== userId || !connection.sessionId) continue
    if (!isSessionActive(db, connection.sessionId)) continue
    emit(connection, event, ...args)
    delivered++
  }
  return delivered
}

/**
 * Delivers to every connection regardless of identity: public events (nft.updated),
 * and private ones only to simulate a routing bug.
 */
export function emitToAll<E extends keyof ServerToClientEvents>(event: E, ...args: EventArgs<E>): number {
  for (const connection of activeConnections.values()) emit(connection, event, ...args)
  return activeConnections.size
}

/**
 * Parses the handshake `auth` of a raw `40` / `40{...}` packet. The binding only
 * decodes EVENT packets, so the CONNECT packet is read here directly. Custom
 * namespaces (`40/name,`) are not supported by the binding and are rejected.
 */
function parseConnectPacket(data: string): { token: string | null } | 'unsupported' {
  const body = data.slice(SOCKET_IO_CONNECT_PREFIX.length)
  if (body.startsWith('/')) return 'unsupported'
  if (body === '') return { token: null }
  try {
    const auth = JSON.parse(body) as { token?: unknown }
    return { token: typeof auth.token === 'string' ? auth.token : null }
  } catch {
    return 'unsupported'
  }
}

function rejectConnection(connection: ActiveConnection): void {
  // A refused CONNECT also drops any identity bound by an earlier one.
  connection.userId = null
  connection.sessionId = null
  const error: SocketAuthError = { message: 'UNAUTHENTICATED' }
  connection.raw.client.send(SOCKET_IO_CONNECT_ERROR_PREFIX + JSON.stringify(error))
}

async function handleConnectPacket(connection: ActiveConnection, data: string): Promise<void> {
  const parsed = parseConnectPacket(data)
  if (parsed === 'unsupported') return rejectConnection(connection)

  if (parsed.token) {
    const lookup = await lookupSession(parsed.token).catch(() => null)
    if (lookup?.status !== 'valid') return rejectConnection(connection)
    connection.userId = lookup.user.id
    connection.sessionId = lookup.session.id
  }

  emit(
    connection,
    'system.hello',
    createEnvelope('system.hello', { kind: 'connection', id: connection.id }, 1, {
      connectionId: connection.id,
      userId: connection.userId,
    }),
  )
}

export const socketHandlers = [
  realtime.addEventListener('connection', (raw) => {
    if (blocked) return refuseConnection(raw)
    const io = toSocketIo(raw)
    const connection: ActiveConnection = { id: raw.client.id, raw, io, userId: null, sessionId: null }
    activeConnections.set(connection.id, connection)

    const heartbeat = setInterval(() => {
      raw.client.send(ENGINE_IO_PING_PACKET)
    }, ENGINE_IO_PING_INTERVAL_MS)

    raw.client.addEventListener('close', () => {
      clearInterval(heartbeat)
      activeConnections.delete(connection.id)
    })

    // The client sends its CONNECT packet after the engine.io OPEN that the binding
    // emits, so by now the binding's own CONNECT acknowledgement was already sent.
    raw.client.addEventListener('message', (event) => {
      if (typeof event.data === 'string' && event.data.startsWith(SOCKET_IO_CONNECT_PREFIX)) {
        void handleConnectPacket(connection, event.data)
      }
    })

    io.client.on('system.ping', (_event, payload: { echo: string }) => {
      emit(
        connection,
        'system.pong',
        createEnvelope('system.pong', { kind: 'connection', id: connection.id }, 1, payload),
      )
    })
  }),
]
