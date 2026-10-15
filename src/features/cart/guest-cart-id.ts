import { useSyncExternalStore } from 'react'
import { guestCartIdSchema } from '@/contracts/cart'

/**
 * Id of the visitor cart, sent as X-Cart-Id. Created only when a visitor first adds
 * something (no id, no cart, no request) and deleted once the cart is merged into an
 * account. It identifies the browser's visitor cart, not a person, so it is not
 * private data of any account.
 */
export const GUEST_CART_STORAGE_KEY = 'kurio:guest-cart'

const listeners = new Set<() => void>()

function read(): string | null {
  try {
    const parsed = guestCartIdSchema.safeParse(localStorage.getItem(GUEST_CART_STORAGE_KEY))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

let current = read()

function commit(next: string | null): void {
  if (next === current) return
  current = next
  for (const listener of listeners) listener()
}

export const guestCartStore = {
  get(): string | null {
    return current
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  /**
   * Persisted first: if storage fails, the visitor gets an error instead of a cart lost
   * on refresh. `beforeCommit` runs before anyone is told about the new id.
   */
  ensure(beforeCommit?: (id: string) => void): string {
    if (current) return current
    const id = `gc_${crypto.randomUUID()}`
    localStorage.setItem(GUEST_CART_STORAGE_KEY, id)
    beforeCommit?.(id)
    commit(id)
    return id
  },

  /** Drops the id only if it is still the one that was merged (another tab may have made a new one). */
  clear(merged: string): void {
    if (current !== merged) return
    localStorage.removeItem(GUEST_CART_STORAGE_KEY)
    commit(null)
  },
}

window.addEventListener('storage', (event) => {
  if (event.key === GUEST_CART_STORAGE_KEY) commit(read())
})

export function useGuestCartId(): string | null {
  return useSyncExternalStore(guestCartStore.subscribe, guestCartStore.get)
}
