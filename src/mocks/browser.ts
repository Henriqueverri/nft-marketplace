import { setupWorker } from 'msw/browser'
import { armOrderSettlements } from './api/orders'
import { handlers } from './handlers'

export const worker = setupWorker(...handlers)

export async function startMockWorker(): Promise<void> {
  await worker.start({
    serviceWorker: { url: '/mockServiceWorker.js' },
    onUnhandledRequest: 'bypass',
    quiet: import.meta.env.PROD,
  })
  // Pending orders created before this page load settle on time, read or not.
  void armOrderSettlements()
}
