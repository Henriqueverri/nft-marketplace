import type { Page } from '@playwright/test'

/**
 * Calls the MSW control API from inside the page, so the request is served by the
 * mock service worker exactly like any app request (Playwright routing is not used).
 */
export async function callMockControl<T>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: unknown,
): Promise<T> {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Expected a JSON response from the mock at ${path}, got "${contentType}"`)
      }
      return response.json()
    },
    { path, method, body },
  )
}

export interface MockStatus {
  mocks: boolean
  socketConnections: number
}

export interface MockConnections {
  connections: { connectionId: string; userId: string | null }[]
}

export interface MockStateSummary {
  storage: { status: 'ok' | 'corrupted'; bytes: number }
  counts: { users: number; activeSessions: number }
  users: { id: string; email: string; displayName: string; activeSessions: number }[]
  scenario: { latencyMs: number; failure: string }
}

export const DB_STORAGE_KEY = 'kurio:mock-db:v1'
export const SESSION_STORAGE_KEY = 'kurio:session'
