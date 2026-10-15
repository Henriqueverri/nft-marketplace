import { findIntegrityProblems } from './integrity'
import type { DbState } from './schema'
import { createSeedState, SEED_VERSION } from './seed'
import { DB_STORAGE_KEY, loadDb, saveDb, StorageCorruptedError } from './storage'

/**
 * In-memory copy of the mock database, loaded lazily from storage.
 *
 * Writes are transactional: the mutation runs on a clone, the clone is checked and
 * persisted, and only then replaces the current state. If persisting fails, the
 * request fails and the previous state stays untouched.
 */

let current: DbState | null = null
let corruption: StorageCorruptedError | null = null
let loading: Promise<void> | null = null

async function materializeSeed(): Promise<DbState> {
  const seed = await createSeedState()
  saveDb(seed)
  return seed
}

async function load(): Promise<void> {
  const result = loadDb(SEED_VERSION)
  switch (result.status) {
    case 'ok':
      current = result.state
      corruption = null
      return
    case 'empty':
    case 'outdated':
      current = await materializeSeed()
      corruption = null
      return
    case 'corrupted':
      // Never reseed silently: the data the user expected is gone, so every API call
      // fails until the database is reset explicitly (panel or POST /__mock/reset).
      current = null
      corruption = new StorageCorruptedError(result.problems)
  }
}

function ensureLoaded(): Promise<void> {
  if (current || corruption) return Promise.resolve()
  loading ??= load().finally(() => {
    loading = null
  })
  return loading
}

export async function readDb(): Promise<DbState> {
  await ensureLoaded()
  if (corruption) throw corruption
  return current!
}

export async function transaction<T>(mutate: (draft: DbState) => T): Promise<T> {
  const state = await readDb()
  const draft = structuredClone(state)
  const result = mutate(draft)
  const problems = findIntegrityProblems(draft)
  if (problems.length > 0) throw new Error(`Mock database invariant violated: ${problems.join('; ')}`)
  saveDb(draft)
  current = draft
  return result
}

export async function resetDb(): Promise<void> {
  const seed = await createSeedState()
  saveDb(seed)
  current = seed
  corruption = null
}

export async function getStorageStatus(): Promise<'ok' | 'corrupted'> {
  await ensureLoaded()
  return corruption ? 'corrupted' : 'ok'
}

// Another tab wrote the database: drop the in-memory copy and reload it on next use.
window.addEventListener('storage', (event) => {
  if (event.key === DB_STORAGE_KEY) {
    current = null
    corruption = null
  }
})
