import { delay, HttpResponse, type DefaultBodyType, type HttpResponseResolver, type PathParams } from 'msw'
import { apiError } from './api/respond'
import { StorageCorruptedError, StorageFullError } from './db/storage'
import { getScenario } from './scenarios'

/**
 * Wraps every /api/* resolver with the active network scenario (latency and
 * failures) and maps persistence failures to explicit API errors.
 * Control endpoints (/__mock/*) are deliberately not wrapped.
 */
export function withNetwork<Params extends PathParams>(
  resolver: HttpResponseResolver<Params, DefaultBodyType, DefaultBodyType>,
): HttpResponseResolver<Params, DefaultBodyType, DefaultBodyType> {
  return async (info) => {
    const { latencyMs, failure } = getScenario()
    if (latencyMs > 0) await delay(latencyMs)

    switch (failure) {
      case 'offline':
        return HttpResponse.error()
      case 'server-error':
        return apiError('INTERNAL_ERROR', 'Erro interno simulado pelo cenário de falha.')
      case 'unavailable':
        return apiError('SERVICE_UNAVAILABLE', 'Serviço temporariamente indisponível.')
    }

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
  }
}
