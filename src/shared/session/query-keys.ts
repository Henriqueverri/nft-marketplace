/** The current session ({ user, expiresAt } or null). */
export const sessionQueryKey = ['session'] as const

/**
 * Every query with private data starts with ['user', userId]. Together with the cache
 * reset on each session change, a response can only ever land in its owner's entry.
 */
export function privateQueryKey<TParts extends readonly unknown[]>(userId: string, ...parts: TParts) {
  return ['user', userId, ...parts] as const
}
