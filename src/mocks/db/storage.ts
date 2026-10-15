import { dbStateSchema, type DbState } from './schema'
import { findIntegrityProblems } from './integrity'

/**
 * Persistence of the mock database: one JSON document in localStorage.
 * Failures are surfaced as typed errors; nothing here pretends a write succeeded.
 */

export const DB_STORAGE_KEY = 'kurio:mock-db:v1'

export class StorageFullError extends Error {
  constructor(cause: unknown) {
    super('The mock database could not be written: browser storage is full', { cause })
    this.name = 'StorageFullError'
  }
}

export class StorageCorruptedError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`The persisted mock database is invalid: ${problems.slice(0, 3).join('; ')}`)
    this.name = 'StorageCorruptedError'
    this.problems = problems
  }
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; state: DbState }
  | { status: 'outdated' }
  | { status: 'corrupted'; problems: string[] }

export function loadDb(expectedSeedVersion: number): LoadResult {
  const raw = localStorage.getItem(DB_STORAGE_KEY)
  if (raw === null) return { status: 'empty' }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { status: 'corrupted', problems: ['not valid JSON'] }
  }

  const parsed = dbStateSchema.safeParse(json)
  if (!parsed.success) {
    const seedVersion = (json as { seedVersion?: unknown } | null)?.seedVersion
    if (typeof seedVersion === 'number' && seedVersion !== expectedSeedVersion) return { status: 'outdated' }
    return {
      status: 'corrupted',
      problems: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    }
  }
  if (parsed.data.seedVersion !== expectedSeedVersion) return { status: 'outdated' }

  const problems = findIntegrityProblems(parsed.data)
  if (problems.length > 0) return { status: 'corrupted', problems }
  return { status: 'ok', state: parsed.data }
}

export function saveDb(state: DbState): void {
  try {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      throw new StorageFullError(error)
    }
    throw error
  }
}

export function persistedDbBytes(): number {
  return localStorage.getItem(DB_STORAGE_KEY)?.length ?? 0
}
