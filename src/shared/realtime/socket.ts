import type { Socket } from 'socket.io-client'
import {
  SOCKET_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@/contracts/events'

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/**
 * socket.io-client is loaded on demand: engine.io-client captures
 * `globalThis.WebSocket` when its module is evaluated, so it must be evaluated
 * only after the MSW worker has started and patched `WebSocket`.
 */
export async function createRealtimeSocket(): Promise<RealtimeSocket> {
  const { io } = await import('socket.io-client')

  return io(window.location.origin, {
    path: SOCKET_PATH,
    // MSW intercepts WebSocket only; engine.io HTTP long-polling is not mocked.
    transports: ['websocket'],
    autoConnect: false,
    reconnectionDelay: 500,
    reconnectionDelayMax: 3000,
  })
}
