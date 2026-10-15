import { QueryClient } from '@tanstack/react-query'
import { isTransientHttpError } from '@/shared/api/http'

const MAX_QUERY_RETRIES = 2

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isTransientHttpError(error)
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}
