import { DEFAULT_SCENARIO, mockScenarioSchema, type MockScenario } from '@/contracts/mock'

/**
 * Active network scenario, persisted so that it survives a refresh (a demo of a
 * slow network should stay slow after reloading). Reset restores the default.
 */

const SCENARIO_STORAGE_KEY = 'kurio:mock-scenario:v1'

function loadScenario(): MockScenario {
  const raw = localStorage.getItem(SCENARIO_STORAGE_KEY)
  if (!raw) return DEFAULT_SCENARIO
  try {
    const parsed = mockScenarioSchema.safeParse(JSON.parse(raw))
    if (parsed.success) return parsed.data
  } catch {
    // An unreadable scenario falls back to the default; it holds no user data.
  }
  return DEFAULT_SCENARIO
}

let scenario = loadScenario()

export function getScenario(): MockScenario {
  return scenario
}

/** Storage errors propagate to the caller, and the active scenario stays unchanged. */
export function setScenario(next: MockScenario): MockScenario {
  localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(next))
  scenario = next
  return scenario
}

export function resetScenario(): MockScenario {
  localStorage.removeItem(SCENARIO_STORAGE_KEY)
  scenario = DEFAULT_SCENARIO
  return scenario
}
