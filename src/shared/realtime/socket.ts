import type { Socket } from 'socket.io-client'
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketAuth,
} from '@/contracts/events'

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/**
 * socket.io-client is loaded on demand: engine.io-client captures
 * `globalThis.WebSocket` when its module is evaluated, so it must be evaluated
 * only after the MSW worker has started and patched `WebSocket`.
 *
 * One socket per session: `forceNew` gives it its own Manager and WebSocket, so a
 * connection authenticated as one user is never reused for another. The token goes
 * in the CONNECT packet (`auth`), inside the WebSocket frame, never in the URL.
 */
export async function createRealtimeSocket(token: string | null): Promise<RealtimeSocket> {
  const { io } = await import('./socket-client')
  const auth: SocketAuth | undefined = token ? { token } : undefined

  return io(window.location.origin, {
    path: SOCKET_PATH,
    // MSW intercepts WebSocket only; engine.io HTTP long-polling is not mocked.
    transports: ['websocket'],
    autoConnect: false,
    forceNew: true,
    auth,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  })
}
