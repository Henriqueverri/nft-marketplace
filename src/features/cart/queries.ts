import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { AddCartItemRequest, Cart } from '@/contracts/cart'
import type { NftUpdatedEvent } from '@/contracts/events'
import { useSessionSnapshot } from '@/features/auth/queries'
import { ApiError } from '@/shared/api/errors'
import { RECONCILE_ON_RECONNECT_META } from '@/shared/realtime/context'
import { privateQueryKey } from '@/shared/session/query-keys'
import { sessionStore } from '@/shared/session/session-store'
import {
  addCartItem,
  applyCoupon,
  createQuote,
  dismissCartNotices,
  fetchCart,
  mergeGuestCart,
  removeCartItem,
  removeCoupon,
  updateCartItem,
  type CartOwner,
} from './api'
import { guestCartStore, useGuestCartId } from './guest-cart-id'

/** The account cart while signed in; otherwise the visitor cart of this browser, if any. */
export type CartIdentity = { kind: 'user'; userId: string } | { kind: 'guest'; cartId: string | null }

function identityOf(userId: string | null, guestCartId: string | null): CartIdentity {
  return userId ? { kind: 'user', userId } : { kind: 'guest', cartId: guestCartId }
}

export function currentCartIdentity(): CartIdentity {
  return identityOf(sessionStore.getSnapshot().userId, guestCartStore.get())
}

export function useCartIdentity(): CartIdentity {
  const { userId } = useSessionSnapshot()
  const guestCartId = useGuestCartId()
  return identityOf(userId, guestCartId)
}

/**
 * The account cart is private (['user', userId, ...], dropped on every session
 * change); a visitor cart is keyed by its id. Quotes have their own prefix, so
 * invalidating a cart never refetches a quote of an older revision by accident.
 */
export const cartKeys = {
  cart: (identity: CartIdentity) =>
    identity.kind === 'user' ? privateQueryKey(identity.userId, 'cart') : (['cart', 'guest', identity.cartId ?? 'none'] as const),
  quotes: (identity: CartIdentity) =>
    identity.kind === 'user' ? privateQueryKey(identity.userId, 'quote') : (['quote', 'guest', identity.cartId ?? 'none'] as const),
  quote: (identity: CartIdentity, revision: number) => [...cartKeys.quotes(identity), revision] as const,
}

const CART_MUTATION_KEY = ['cart', 'mutation'] as const

function ownerOf(identity: CartIdentity): CartOwner | null {
  if (identity.kind === 'user') return { kind: 'user' }
  return identity.cartId ? { kind: 'guest', cartId: identity.cartId } : null
}

/** Visitor cart writes still waiting for the server's answer. */
const visitorWrites = new Set<Promise<unknown>>()

function trackVisitorWrite<T>(request: Promise<T>): Promise<T> {
  visitorWrites.add(request)
  const done = () => visitorWrites.delete(request)
  request.then(done, done)
  return request
}

let runningMerge: { userId: string; cartId: string; promise: Promise<Cart> } | null = null

/**
 * Merges the pending visitor cart (just signed in) into the account, once at a time.
 * It runs outside any query on purpose: a read of the cart can be cancelled (a change
 * starting, the session ending) while the server still applies the merge, so the
 * merge's own answer is what reaches the cache. Before it starts, visitor writes sent
 * before the sign-in are awaited, so the server merges them instead of receiving them
 * afterwards. The merge is idempotent on the server; the local id is dropped only
 * after the server answered for this same session.
 */
function mergePendingGuestCart(queryClient: QueryClient, identity: { kind: 'user'; userId: string }): Promise<Cart> | null {
  const cartId = guestCartStore.get()
  if (!cartId) return null
  if (runningMerge?.userId === identity.userId && runningMerge.cartId === cartId) return runningMerge.promise
  const promise = Promise.allSettled([...visitorWrites])
    .then(() => {
      if (sessionStore.getSnapshot().userId !== identity.userId) throw new ApiError('SESSION_CHANGED')
      return mergeGuestCart(cartId)
    })
    .then((cart) => {
      applyCart(queryClient, identity, cart)
      guestCartStore.clear(cartId)
      return cart
    })
  runningMerge = { userId: identity.userId, cartId, promise }
  const done = () => {
    if (runningMerge?.promise === promise) runningMerge = null
  }
  promise.then(done, done)
  return promise
}

async function loadCart(queryClient: QueryClient, identity: CartIdentity, signal: AbortSignal): Promise<Cart> {
  if (identity.kind === 'guest') return fetchCart({ kind: 'guest', cartId: identity.cartId! }, signal)
  return (await mergePendingGuestCart(queryClient, identity)) ?? fetchCart({ kind: 'user' }, signal)
}

const EMPTY_CART: Cart = { owner: 'guest', revision: 0, items: [], itemCount: 0, coupon: null, notices: [] }

export function useCart() {
  const queryClient = useQueryClient()
  const identity = useCartIdentity()
  const exists = ownerOf(identity) !== null
  const query = useQuery({
    queryKey: cartKeys.cart(identity),
    // A read that started before a change the cache already holds must not undo it.
    queryFn: async ({ signal }) => {
      const cart = await loadCart(queryClient, identity, signal)
      const current = queryClient.getQueryData<Cart>(cartKeys.cart(identity))
      return current && current.revision > cart.revision ? current : cart
    },
    enabled: exists,
    meta: RECONCILE_ON_RECONNECT_META,
  })
  // A visitor who never added anything has no cart on the server: nothing to ask.
  if (!exists) {
    return { identity, cart: EMPTY_CART, isPending: false, isError: false, error: null, isFetching: false, refetch: query.refetch }
  }
  return {
    identity,
    cart: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  }
}

/** Responses can arrive out of order; the revision only moves forward in the cache. */
function applyCart(queryClient: QueryClient, identity: CartIdentity, cart: Cart): void {
  queryClient.setQueryData<Cart>(cartKeys.cart(identity), (current) =>
    current && current.revision > cart.revision ? current : cart,
  )
}

/** Errors meaning the cart on screen no longer matches the server's. */
const STALE_CART_CODES = new Set(['QUANTITY_LIMIT_EXCEEDED', 'OUT_OF_STOCK', 'NOT_FOUND', 'CART_CHANGED', 'CART_MERGED', 'CONFLICT'])

interface CartMutationResult {
  identity: CartIdentity
  cart: Cart
}

/** A new visitor id has no cart on the server yet: known empty, nothing to fetch. */
function newGuestIdentity(queryClient: QueryClient): CartIdentity {
  const cartId = guestCartStore.ensure((id) =>
    queryClient.setQueryData<Cart>(cartKeys.cart({ kind: 'guest', cartId: id }), EMPTY_CART),
  )
  return { kind: 'guest', cartId }
}

const isCartMerged = (error: unknown) => error instanceof ApiError && error.code === 'CART_MERGED'

/**
 * Every cart change goes through the server, which answers with the whole cart; the
 * answer replaces the cached cart (quotes follow its new revision). The identity is
 * captured when the request starts: a response for a previous session is discarded
 * by the HTTP layer, and one for this session lands only in its own entry.
 *
 * Order on the server: a change of the account cart waits for a pending merge, so it
 * never reaches the server before the visitor's items. Reads of the cart in flight
 * are cancelled (their answer would be older than the change's).
 */
function useCartMutation<TVariables>(
  run: (owner: CartOwner, variables: TVariables) => Promise<Cart>,
  { createsGuestCart = false }: { createsGuestCart?: boolean } = {},
) {
  const queryClient = useQueryClient()

  async function send(identity: CartIdentity, variables: TVariables): Promise<Cart> {
    const owner = ownerOf(identity)
    if (!owner) throw new ApiError('NOT_FOUND', { message: 'Seu carrinho está vazio.' })
    await queryClient.cancelQueries({ queryKey: cartKeys.cart(identity), exact: true })
    const request = run(owner, variables)
    return owner.kind === 'guest' ? trackVisitorWrite(request) : request
  }

  return useMutation({
    mutationKey: CART_MUTATION_KEY,
    mutationFn: async (variables: TVariables): Promise<CartMutationResult> => {
      let identity = currentCartIdentity()
      if (identity.kind === 'guest' && !identity.cartId && createsGuestCart) identity = newGuestIdentity(queryClient)
      if (identity.kind === 'user') await mergePendingGuestCart(queryClient, identity)
      try {
        return { identity, cart: await send(identity, variables) }
      } catch (error) {
        // This browser's visitor id was already merged into an account (its answer was
        // lost): the id is dead. An addition starts a new visitor cart once.
        if (!isCartMerged(error) || identity.kind !== 'guest') throw error
        guestCartStore.clear(identity.cartId!)
        if (!createsGuestCart) throw error
        identity = newGuestIdentity(queryClient)
        return { identity, cart: await send(identity, variables) }
      }
    },
    onSuccess: ({ identity, cart }) => applyCart(queryClient, identity, cart),
    onError: (error) => {
      if (error instanceof ApiError && STALE_CART_CODES.has(error.code)) {
        void queryClient.invalidateQueries({ queryKey: cartKeys.cart(currentCartIdentity()), exact: true })
      }
    },
  })
}

export function useAddToCart() {
  return useCartMutation((owner, body: AddCartItemRequest) => addCartItem(owner, body), { createsGuestCart: true })
}

export function useUpdateCartItem() {
  return useCartMutation((owner, { itemId, quantity }: { itemId: string; quantity: number }) =>
    updateCartItem(owner, itemId, quantity),
  )
}

export function useRemoveCartItem() {
  return useCartMutation((owner, itemId: string) => removeCartItem(owner, itemId))
}

export function useApplyCoupon() {
  return useCartMutation((owner, code: string) => applyCoupon(owner, { code }))
}

export function useRemoveCoupon() {
  return useCartMutation((owner) => removeCoupon(owner))
}

export function useDismissCartNotices() {
  return useCartMutation((owner) => dismissCartNotices(owner))
}

/** True while any cart change is in flight: the summary is not final until it settles. */
export function useCartMutating(): boolean {
  return useIsMutating({ mutationKey: CART_MUTATION_KEY }) > 0
}

/**
 * Quote of the revision on screen, from POST /quotes. A new revision is a new key, so
 * the previous quote is never shown as the current one. If the server's cart moved on
 * (409 CART_CHANGED), the cart is refetched and the next revision is quoted.
 */
export function useQuote(identity: CartIdentity, cart: Cart | undefined) {
  const queryClient = useQueryClient()
  const owner = ownerOf(identity)
  const revision = cart?.revision ?? -1
  return useQuery({
    queryKey: cartKeys.quote(identity, revision),
    queryFn: async ({ signal }) => {
      try {
        return await createQuote(owner!, revision, signal)
      } catch (error) {
        if (error instanceof ApiError && error.code === 'CART_CHANGED') {
          void queryClient.invalidateQueries({ queryKey: cartKeys.cart(identity), exact: true })
        }
        throw error
      }
    },
    enabled: owner !== null && !!cart && cart.items.length > 0,
    meta: RECONCILE_ON_RECONNECT_META,
  })
}

/**
 * `nft.updated` for an NFT in the cart: the quote on screen is dropped at once (its
 * prices may be wrong) and the cart is refetched; the server reconciles it, records
 * what changed as notices and a new quote follows. Duplicates and events not newer
 * than the version the cart was priced with change nothing.
 */
export function syncCartWithNftUpdate(queryClient: QueryClient, event: NftUpdatedEvent): void {
  const identity = currentCartIdentity()
  if (!ownerOf(identity)) return
  const cart = queryClient.getQueryData<Cart>(cartKeys.cart(identity))
  const item = cart?.items.find((candidate) => candidate.nft.id === event.payload.nftId)
  if (!item || event.version <= item.nft.version) return
  void queryClient.resetQueries({ queryKey: cartKeys.quotes(identity) })
  void queryClient.invalidateQueries({ queryKey: cartKeys.cart(identity), exact: true })
}
