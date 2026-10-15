import { delay, HttpResponse, type DefaultBodyType, type HttpResponseResolver, type PathParams } from 'msw'
import type { FailureMode, NetworkActivity, QueueDelaysRequest } from '@/contracts/mock'
import { apiError } from './api/respond'
import { StorageCorruptedError, StorageFullError } from './db/storage'
import { getScenario } from './scenarios'

interface QueuedDelay {
  pathPrefix: string
  method: string | undefined
  delayMs: number
  failure: FailureMode | undefined
}

let queuedDelays: QueuedDelay[] = []
let inFlight = 0
let handledRequests: Record<string, number> = {}

/**
 * One-shot delays (and optional failures) for the next requests matching
 * `pathPrefix` and `method`, consumed in arrival order. Lets tests deliver an older
 * response after a newer one, or fail one request while others succeed.
 */
export function queueDelays({ pathPrefix, method, delaysMs, failure }: QueueDelaysRequest): number {
  queuedDelays.push(...delaysMs.map((delayMs) => ({ pathPrefix, method, delayMs, failure })))
  return queuedDelays.length
}

/** Drops queued delays and the request log; requests in flight still finish. */
export function resetNetwork(): void {
  queuedDelays = []
  handledRequests = {}
}

export function getNetworkActivity(): NetworkActivity {
  return { inFlight, requests: { ...handledRequests } }
}

function takeQueuedDelay(request: Request): QueuedDelay | undefined {
  const { pathname } = new URL(request.url)
  const index = queuedDelays.findIndex(
    (entry) => pathname.startsWith(entry.pathPrefix) && (!entry.method || entry.method === request.method),
  )
  if (index === -1) return undefined
  return queuedDelays.splice(index, 1)[0]
}

function failWith(failure: FailureMode) {
  switch (failure) {
    case 'offline':
      return HttpResponse.error()
    case 'server-error':
      return apiError('INTERNAL_ERROR', 'Erro interno simulado pelo cenário de falha.')
    case 'unavailable':
      return apiError('SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível.')
    case 'none':
      return null
  }
}

/**
 * Wraps every /api/* resolver with the active network scenario (latency and
 * failures) and maps persistence failures to explicit API errors.
 * Control endpoints (/__mock/*) are deliberately not wrapped.
 */
export function withNetwork<Params extends PathParams>(
  resolver: HttpResponseResolver<Params, DefaultBodyType, DefaultBodyType>,
): HttpResponseResolver<Params, DefaultBodyType, DefaultBodyType> {
  return async (info) => {
    const url = new URL(info.request.url)
    const logKey = `${info.request.method} ${url.pathname}${url.search}`
    inFlight++
    try {
      const { latencyMs, failure } = getScenario()
      const queued = takeQueuedDelay(info.request)
      const totalDelay = latencyMs + (queued?.delayMs ?? 0)
      if (totalDelay > 0) await delay(totalDelay)

      const failed = failWith(queued?.failure ?? failure)
      if (failed) return failed

      try {
        return await resolver(info)
      } catch (error) {
        if (error instanceof StorageFullError) {
          return apiError(
            'STORAGE_FULL',
            'Não foi possível salvar: o armazenamento local do navegador está cheio.',
          )
        }
        if (error instanceof StorageCorruptedError) {
          return apiError(
            'STORAGE_CORRUPTED',
            'Os dados da demonstração estão corrompidos. Restaure o estado inicial no painel de cenários.',
          )
        }
        console.error('[mock api] unexpected error', error)
        return apiError('INTERNAL_ERROR', 'Erro inesperado na API simulada.')
      }
    } finally {
      inFlight--
      handledRequests[logKey] = (handledRequests[logKey] ?? 0) + 1
    }
  }
}
