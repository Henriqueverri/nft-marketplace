import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { env } from '@/app/env'
import { createQueryClient } from '@/app/query-client'
import { createAppRouter } from '@/app/router'
import { RealtimeProvider } from '@/shared/realtime/RealtimeProvider'
import './index.css'

async function enableMocking(): Promise<void> {
  if (!env.enableMocks) return
  const { startMockWorker } = await import('./mocks/browser')
  await startMockWorker()
}

const queryClient = createQueryClient()
const router = createAppRouter(queryClient)

// The worker must be running before the first request and before the socket is created.
await enableMocking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <RouterProvider router={router} />
      </RealtimeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
