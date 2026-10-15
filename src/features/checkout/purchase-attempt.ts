import { z } from 'zod'
import { createOrderRequestSchema, idempotencyKeySchema, type CreateOrderRequest } from '@/contracts/orders'
import { clearDraft, readDraft, writeDraft } from '@/shared/session/drafts'

/**
 * One purchase attempt: the Idempotency-Key and the exact body sent with it. It is
 * stored (per user, with the session drafts) before the request leaves, and dropped
 * only when the server's answer is known. A timeout or a lost answer keeps it, so the
 * retry sends the same key and the same body and gets back the order the first send
 * may have created. A different body is a different attempt, with a new key.
 */
export interface PurchaseAttempt {
  key: string
  request: CreateOrderRequest
}

const ATTEMPT_DRAFT = 'checkout.attempt'

const attemptSchema = z.object({ key: idempotencyKeySchema, request: createOrderRequestSchema })

export function readAttempt(userId: string): PurchaseAttempt | null {
  const raw = readDraft(userId, ATTEMPT_DRAFT)
  if (!raw) return null
  try {
    const parsed = attemptSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function clearAttempt(userId: string): void {
  clearDraft(userId, ATTEMPT_DRAFT)
}

/** Fixed field order, so equal bodies compare equal. */
function sameRequest(a: CreateOrderRequest, b: CreateOrderRequest): boolean {
  const flat = (request: CreateOrderRequest) => [
    request.quoteId,
    request.cartRevision,
    request.walletId,
    request.networkId,
    request.buyer.fullName,
    request.buyer.email,
  ]
  return JSON.stringify(flat(a)) === JSON.stringify(flat(b))
}

/** The stored attempt if it carries this same body; otherwise a new attempt, stored now. */
export function attemptFor(userId: string, request: CreateOrderRequest): PurchaseAttempt {
  const stored = readAttempt(userId)
  if (stored && sameRequest(stored.request, request)) return stored
  const attempt = { key: crypto.randomUUID(), request }
  writeDraft(userId, ATTEMPT_DRAFT, JSON.stringify(attempt))
  return attempt
}
