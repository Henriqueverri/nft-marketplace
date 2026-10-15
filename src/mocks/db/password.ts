/**
 * Password protection for the SIMULATED authentication of the demo.
 *
 * The mock API runs in the browser, so this protects only the copy persisted in
 * localStorage; it is not equivalent to a real backend. Parameters follow the OWASP
 * Password Storage Cheat Sheet for PBKDF2: HMAC-SHA-256, 600,000 iterations,
 * 16-byte random salt per password, 256-bit derived key. The original password is
 * never stored; only the salt and the derived key are.
 */

export const PASSWORD_KDF = {
  algorithm: 'PBKDF2-SHA-256',
  iterations: 600_000,
  saltBytes: 16,
  keyBits: 256,
} as const

export interface PasswordHash {
  algorithm: typeof PASSWORD_KDF.algorithm
  iterations: number
  /** base64 */
  salt: string
  /** base64 */
  hash: string
}

const encoder = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    PASSWORD_KDF.keyBits,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_KDF.saltBytes))
  const hash = await derive(password, salt, PASSWORD_KDF.iterations)
  return {
    algorithm: PASSWORD_KDF.algorithm,
    iterations: PASSWORD_KDF.iterations,
    salt: toBase64(salt),
    hash: toBase64(hash),
  }
}

/** Compares every byte regardless of where the first difference is. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]
  return difference === 0
}

export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const derived = await derive(password, fromBase64(stored.salt), stored.iterations)
  return constantTimeEqual(derived, fromBase64(stored.hash))
}

/**
 * Used when the e-mail does not exist, so that an unknown e-mail and a wrong
 * password take the same time and return the same error.
 */
let dummyHash: Promise<PasswordHash> | null = null
export function getDummyPasswordHash(): Promise<PasswordHash> {
  dummyHash ??= hashPassword(crypto.randomUUID())
  return dummyHash
}

/** Session tokens: 256 random bits, base64url. Only their SHA-256 digest is stored. */
export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function digestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
