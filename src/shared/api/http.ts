import axios from 'axios'

/** Single HTTP entry point of the app. Every REST call goes through this instance. */
export const http = axios.create({
  baseURL: '/api',
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})

/** Network failures, timeouts and 5xx are transient; 4xx responses are final. */
export function isTransientHttpError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false
  const status = error.response?.status
  return status === undefined || status >= 500
}
