import axios from 'axios'
import { apiErrorBodySchema, type ApiErrorCode } from '@/contracts/errors'

/** Client-only failure kinds, for requests that never produced an API error body. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELED' | 'SESSION_CHANGED' | 'UNEXPECTED_RESPONSE'

export type ErrorCode = ApiErrorCode | ClientErrorCode

const fallbackMessages: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Revise os campos destacados.',
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  UNAUTHENTICATED: 'Entre na sua conta para continuar.',
  SESSION_EXPIRED: 'Sua sessão expirou. Entre novamente para continuar.',
  FORBIDDEN: 'Você não tem permissão para acessar este recurso.',
  NOT_FOUND: 'Recurso não encontrado.',
  EMAIL_TAKEN: 'Já existe uma conta com este e-mail.',
  USERNAME_TAKEN: 'Este nome de usuário já está em uso.',
  CONFLICT: 'Os dados mudaram enquanto você editava. Revise e tente novamente.',
  STORAGE_FULL: 'Não foi possível salvar: o armazenamento local do navegador está cheio.',
  STORAGE_CORRUPTED: 'Os dados da demonstração estão corrompidos. Restaure o estado inicial.',
  INTERNAL_ERROR: 'Ocorreu um erro no servidor. Tente novamente.',
  SERVICE_UNAVAILABLE: 'Serviço temporariamente indisponível. Tente novamente em instantes.',
  NETWORK_ERROR: 'Sem conexão com o servidor. Verifique sua rede e tente novamente.',
  TIMEOUT: 'O servidor demorou demais para responder. Tente novamente.',
  CANCELED: 'A operação foi cancelada.',
  SESSION_CHANGED: 'A sessão mudou durante a operação.',
  UNEXPECTED_RESPONSE: 'Resposta inesperada do servidor.',
}

/** The only error shape the UI handles. Every HTTP failure is normalized into it. */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number | null
  readonly fieldErrors: Record<string, string[]>

  constructor(code: ErrorCode, options: { message?: string; status?: number | null; fieldErrors?: Record<string, string[]>; cause?: unknown } = {}) {
    super(options.message ?? fallbackMessages[code], { cause: options.cause })
    this.name = 'ApiError'
    this.code = code
    this.status = options.status ?? null
    this.fieldErrors = options.fieldErrors ?? {}
  }

  /** Network failures, timeouts and 5xx can be retried; 4xx are final. */
  get transient(): boolean {
    return (
      this.code === 'NETWORK_ERROR' ||
      this.code === 'TIMEOUT' ||
      (this.status !== null && this.status >= 500 && this.code !== 'STORAGE_CORRUPTED' && this.code !== 'STORAGE_FULL')
    )
  }

  get isUnauthenticated(): boolean {
    return this.code === 'UNAUTHENTICATED' || this.code === 'SESSION_EXPIRED'
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (!axios.isAxiosError(error)) {
    return new ApiError('UNEXPECTED_RESPONSE', { cause: error })
  }
  if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
    return new ApiError('CANCELED', { cause: error })
  }
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return new ApiError('TIMEOUT', { cause: error })
  }
  if (!error.response) {
    return new ApiError('NETWORK_ERROR', { cause: error })
  }

  const body = apiErrorBodySchema.safeParse(error.response.data)
  if (!body.success) {
    return new ApiError(error.response.status >= 500 ? 'INTERNAL_ERROR' : 'UNEXPECTED_RESPONSE', {
      status: error.response.status,
      cause: error,
    })
  }
  return new ApiError(body.data.error.code, {
    message: body.data.error.message,
    status: error.response.status,
    fieldErrors: body.data.error.fieldErrors,
    cause: error,
  })
}
