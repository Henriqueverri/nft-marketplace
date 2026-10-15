import { createContext, useContext } from 'react'
import type { SystemHelloEvent } from '@/contracts/events'

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected'

export interface RealtimeStatus {
  state: RealtimeConnectionState
  connectCount: number
  disconnectCount: number
  lastDisconnectReason: string | null
  lastHello: SystemHelloEvent | null
}

export const initialRealtimeStatus: RealtimeStatus = {
  state: 'idle',
  connectCount: 0,
  disconnectCount: 0,
  lastDisconnectReason: null,
  lastHello: null,
}

export const RealtimeStatusContext = createContext<RealtimeStatus>(initialRealtimeStatus)

export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeStatusContext)
}
