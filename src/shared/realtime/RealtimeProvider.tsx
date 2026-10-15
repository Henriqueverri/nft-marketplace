import { useEffect, useState, type ReactNode } from 'react'
import { createRealtimeSocket, type RealtimeSocket } from './socket'
import { initialRealtimeStatus, RealtimeStatusContext, type RealtimeStatus } from './context'

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<RealtimeStatus>(initialRealtimeStatus)

  useEffect(() => {
    let socket: RealtimeSocket | null = null
    let disposed = false

    void createRealtimeSocket().then((created) => {
      if (disposed) return
      socket = created

      socket.on('connect', () => {
        setStatus((s) => ({ ...s, state: 'connected', connectCount: s.connectCount + 1 }))
      })
      socket.on('disconnect', (reason) => {
        setStatus((s) => ({
          ...s,
          state: 'disconnected',
          disconnectCount: s.disconnectCount + 1,
          lastDisconnectReason: reason,
        }))
      })
      socket.on('system.hello', (event) => {
        setStatus((s) => ({ ...s, lastHello: event }))
      })

      setStatus((s) => ({ ...s, state: 'connecting' }))
      socket.connect()
    })

    return () => {
      disposed = true
      // Listeners go first so that the intentional disconnect is not reported as a drop.
      socket?.removeAllListeners()
      socket?.disconnect()
    }
  }, [])

  return <RealtimeStatusContext value={status}>{children}</RealtimeStatusContext>
}
