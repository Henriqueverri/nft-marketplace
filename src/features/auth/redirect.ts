const AUTH_PATHS = ['/login', '/signup']

/**
 * Accepts only same-origin, path-relative targets ("/cart?x=1"). Absolute URLs,
 * protocol-relative URLs ("//evil.example"), backslash tricks and the auth pages
 * themselves fall back to "/", so `?redirect=` can never send the user elsewhere.
 */
export function sanitizeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/'
  }
  let url: URL
  try {
    url = new URL(value, window.location.origin)
  } catch {
    return '/'
  }
  if (url.origin !== window.location.origin) return '/'
  if (AUTH_PATHS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}

export interface AuthSearch {
  redirect?: string
  reason?: 'expired'
}

export function validateAuthSearch(search: Record<string, unknown>): AuthSearch {
  return {
    ...(typeof search.redirect === 'string' ? { redirect: sanitizeRedirect(search.redirect) } : {}),
    ...(search.reason === 'expired' ? { reason: 'expired' as const } : {}),
  }
}
