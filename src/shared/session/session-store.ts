/**
 * Client-side session state: the opaque token persisted in localStorage plus an
 * `epoch` that changes on every login, logout or expiry.
 *
 * The epoch is the isolation primitive between sessions: HTTP requests are tagged
 * with it and aborted or discarded when it changes, the realtime socket is recreated
 * for it, and the query cache is cleared on every change (see session-lifecycle.ts).
 *
 * Limitation (demo): the token is readable by scripts in localStorage. A production
 * backend would use an httpOnly, SameSite cookie instead.
 */

export const SESSION_STORAGE_KEY = 'kurio:session'

export type SessionEndReason = 'logout' | 'expired' | 'reset'

export interface SessionSnapshot {
  token: string | null
  userId: string | null
  epoch: number
  /** Why the last session ended; null while a session is active or before any session. */
  endReason: SessionEndReason | null
}

type Listener = (snapshot: SessionSnapshot, previous: SessionSnapshot) => void

function readPersisted(): Pick<SessionSnapshot, 'token' | 'userId'> {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as { token?: unknown; userId?: unknown }) : null
    if (typeof parsed?.token === 'string' && typeof parsed.userId === 'string') {
      return { token: parsed.token, userId: parsed.userId }
    }
  } catch {
    // An unreadable entry is treated as no session.
  }
  return { token: null, userId: null }
}

let snapshot: SessionSnapshot = { ...readPersisted(), epoch: 0, endReason: null }
let controller = new AbortController()
const listeners = new Set<Listener>()

function commit(next: SessionSnapshot): void {
  const previous = snapshot
  snapshot = next
  // Everything started under the previous epoch is cancelled.
  controller.abort()
  controller = new AbortController()
  for (const listener of listeners) listener(snapshot, previous)
}

export const sessionStore = {
  getSnapshot(): SessionSnapshot {
    return snapshot
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },

  /** Aborted as soon as the session changes. Attached to every API request. */
  getSignal(): AbortSignal {
    return controller.signal
  },

  /** Persists the new session first: if storage fails, the session does not start. */
  start(token: string, userId: string): void {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ token, userId }))
    commit({ token, userId, epoch: snapshot.epoch + 1, endReason: null })
  },

  end(reason: SessionEndReason): void {
    if (!snapshot.token) return
    localStorage.removeItem(SESSION_STORAGE_KEY)
    commit({ token: null, userId: null, epoch: snapshot.epoch + 1, endReason: reason })
  },
}

// Login or logout in another tab: follow it so both tabs show the same account.
window.addEventListener('storage', (event) => {
  if (event.key !== SESSION_STORAGE_KEY) return
  const persisted = readPersisted()
  if (persisted.token === snapshot.token) return
  commit({
    ...persisted,
    epoch: snapshot.epoch + 1,
    endReason: persisted.token ? null : 'logout',
  })
})
