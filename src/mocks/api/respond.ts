import { HttpResponse } from 'msw'
import type { z } from 'zod'
import { API_ERROR_STATUS, type ApiErrorBody, type ApiErrorCode } from '@/contracts/errors'

export function apiError(
  code: ApiErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): HttpResponse<ApiErrorBody> {
  return HttpResponse.json(
    { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } },
    { status: API_ERROR_STATUS[code] },
  )
}

export function validationError(error: z.ZodError): HttpResponse<ApiErrorBody> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const field = issue.path.join('.') || 'body'
    ;(fieldErrors[field] ??= []).push(issue.message)
  }
  return apiError('VALIDATION_FAILED', 'Revise os campos destacados.', fieldErrors)
}

/** Reads a JSON body; a malformed body is a validation error, not a crash. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
