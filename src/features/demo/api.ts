import {
  expireSessionsResponseSchema,
  mockScenarioSchema,
  mockStateSchema,
  type MockScenario,
} from '@/contracts/mock'
import { mockControlHttp, parseResponse } from '@/shared/api/http'

/** Client of the mock control API. The UI never touches the mock database directly. */

export async function fetchMockState(signal?: AbortSignal) {
  const { data } = await mockControlHttp.get('/state', { signal })
  return parseResponse(mockStateSchema, data)
}

export async function updateScenario(scenario: MockScenario) {
  const { data } = await mockControlHttp.put('/scenario', scenario)
  return parseResponse(mockScenarioSchema, data)
}

export async function expireSessions() {
  const { data } = await mockControlHttp.post('/session/expire', {})
  return parseResponse(expireSessionsResponseSchema, data)
}

export async function resetMockState() {
  const { data } = await mockControlHttp.post('/reset')
  return parseResponse(mockStateSchema, data)
}
