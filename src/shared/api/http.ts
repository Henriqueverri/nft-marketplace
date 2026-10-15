import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import type { z } from 'zod'
import { sessionStore } from '@/shared/session/session-store'
import { ApiError, toApiError } from './errors'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Session epoch the request was sent under (set by the interceptor). */
    sessionEpoch?: number
    /**
     * Not aborted when the session changes; its answer is still discarded
     * (SESSION_CHANGED). Only for writes whose completion the next session must wait
     * for: visitor cart writes, which the sign-in merge has to include.
     */
    keepOnSessionChange?: boolean
  }
}

/** Single HTTP entry point of the app. Every REST call goes through this instance. */
export const http = axios.create({
  baseURL: '/api',
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const session = sessionStore.getSnapshot()
  config.sessionEpoch = session.epoch
  if (session.token) config.headers.set('Authorization', `Bearer ${session.token}`)
  // Requests of a session are aborted when that session ends, so a slow response
  // started by user A can never resolve inside user B's session.
  if (config.keepOnSessionChange) return config
  const sessionSignal = sessionStore.getSignal()
  config.signal = config.signal
    ? AbortSignal.any([config.signal as AbortSignal, sessionSignal])
    : sessionSignal
  return config
})

http.interceptors.response.use(
  (response: AxiosResponse) => {
    if (response.config.sessionEpoch !== sessionStore.getSnapshot().epoch) {
      throw new ApiError('SESSION_CHANGED')
    }
    return response
  },
  (error: unknown) => {
    const apiError = toApiError(error)
    const config = axios.isAxiosError(error) ? error.config : undefined
    const sentWithSession = !!config?.headers?.Authorization
    const sameSession = config?.sessionEpoch === sessionStore.getSnapshot().epoch
    if (apiError.isUnauthenticated && sentWithSession && sameSession) {
      sessionStore.end('expired')
    }
    if (!sameSession && (apiError.code === 'CANCELED' || config?.keepOnSessionChange)) {
      return Promise.reject(new ApiError('SESSION_CHANGED', { cause: error }))
    }
    return Promise.reject(apiError)
  },
)

/** Validates a response body against its contract; a mismatch is an explicit error. */
export function parseResponse<TSchema extends z.ZodType>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    throw new ApiError('UNEXPECTED_RESPONSE', { cause: parsed.error })
  }
  return parsed.data
}

/**
 * Client of the mock control API (/__mock/*), used only by the demo panel. It never
 * sends the session token: control endpoints are not part of the product API.
 */
export const mockControlHttp = axios.create({
  baseURL: '/__mock',
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})
mockControlHttp.interceptors.response.use(undefined, (error: unknown) => Promise.reject(toApiError(error)))

/** Network failures, timeouts and 5xx are transient; 4xx responses are final. */
export function isTransientHttpError(error: unknown): boolean {
  return error instanceof ApiError && error.transient
}
