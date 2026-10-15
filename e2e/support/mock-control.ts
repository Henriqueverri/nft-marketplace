import type { Page } from '@playwright/test'

/**
 * Calls the MSW control API from inside the page, so the request is served by the
 * mock service worker exactly like any app request (Playwright routing is not used).
 */
export async function callMockControl<T>(
  page: Page,
  path: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  return page.evaluate(
    async ({ path, method }) => {
      const response = await fetch(path, { method })
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        throw new Error(`Expected a JSON response from the mock at ${path}, got "${contentType}"`)
      }
      return response.json()
    },
    { path, method },
  )
}

export interface MockStatus {
  mocks: boolean
  socketConnections: number
}
