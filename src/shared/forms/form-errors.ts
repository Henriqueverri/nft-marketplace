import type { z } from 'zod'
import { ApiError } from '@/shared/api/errors'

export type FieldErrors<TField extends string> = Partial<Record<TField, string>>

/** First message of each field, from a client-side validation. */
export function fieldErrorsFromZod<TField extends string>(error: z.ZodError): FieldErrors<TField> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? '')
    errors[field] ??= issue.message
  }
  return errors as FieldErrors<TField>
}

/** Field errors returned by the API (422 validation, 409 conflicts on a field). */
export function fieldErrorsFromApi<TField extends string>(
  error: ApiError,
  fields: readonly TField[],
): FieldErrors<TField> {
  const errors: FieldErrors<TField> = {}
  for (const field of fields) {
    const messages = error.fieldErrors[field]
    if (messages?.length) errors[field] = messages[0]
  }
  return errors
}

export function firstInvalidField<TField extends string>(
  order: readonly TField[],
  errors: FieldErrors<TField>,
): TField | undefined {
  return order.find((field) => errors[field])
}

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Algo deu errado. Tente novamente.'
}
