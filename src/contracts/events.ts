/**
 * Socket.IO event contracts shared by the app, the MSW mocks and the E2E tests.
 * Every server event carries a stable identity, the affected resource and a version.
 * Private events carry `userId`; clients drop private events of any other user.
 */
import type { AccountProfile } from './account'
import type { EthAmount, UserId } from './common'

export const SOCKET_PATH = '/socket.io/'

export interface EventEnvelope<TType extends string, TPayload> {
  eventId: string
  type: TType
  resource: { kind: string; id: string }
  version: number
  occurredAt: string
  userId?: UserId
  payload: TPayload
}

/**
 * Sent after the server processed the Socket.IO CONNECT packet. `userId` is the
 * identity bound to this connection (null when no valid session token was sent).
 */
export type SystemHelloEvent = EventEnvelope<
  'system.hello',
  { connectionId: string; userId: UserId | null }
>

export type SystemPongEvent = EventEnvelope<'system.pong', { echo: string }>

/** Private: the owner's profile changed (from any tab or device). */
export type ProfileUpdatedEvent = EventEnvelope<'profile.updated', AccountProfile> & {
  userId: UserId
}

/**
 * Public: price or availability of an NFT changed. `version` equals the NFT's new
 * `version` in the REST API, so clients apply an event only when it is newer than
 * what they hold and REST and realtime never disagree after reconciliation.
 */
export type NftUpdatedEvent = EventEnvelope<
  'nft.updated',
  {
    nftId: string
    /** Lowest current edition price. */
    priceEth: EthAmount
    compareAtPriceEth: EthAmount | null
    editions: { id: string; priceEth: EthAmount; available: number }[]
  }
>

/**
 * Private: an order was created (`pending`, version 1) or settled (`confirmed` or
 * `rejected`, version 2). `version` equals the order's `version` in the REST API.
 * Only the identity and the state travel here; the receipt is read over REST.
 */
export type OrderUpdatedEvent = EventEnvelope<
  'order.updated',
  { orderId: string; status: 'pending' | 'confirmed' | 'rejected' }
> & { userId: UserId }

/** Payload of a CONNECT_ERROR sent when the handshake `auth` is rejected. */
export interface SocketAuthError {
  message: 'UNAUTHENTICATED'
}

/** Handshake `auth` sent in the Socket.IO CONNECT packet (never in the URL). */
export interface SocketAuth {
  token?: string
}

export interface ServerToClientEvents {
  'system.hello': (event: SystemHelloEvent) => void
  'system.pong': (event: SystemPongEvent) => void
  'profile.updated': (event: ProfileUpdatedEvent) => void
  'nft.updated': (event: NftUpdatedEvent) => void
  'order.updated': (event: OrderUpdatedEvent) => void
}

export interface ClientToServerEvents {
  'system.ping': (payload: { echo: string }) => void
}

export type ServerEventName = keyof ServerToClientEvents
