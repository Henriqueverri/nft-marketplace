import { http, HttpResponse } from 'msw'
import { getScenario } from './scenarios'

/** The realtime client chunk: `socket-client-<hash>.js` in builds, the source module in dev. */
const REALTIME_CLIENT_CHUNK = /\/socket-client(?:-[\w-]+)?\.(?:js|ts)(?:\?.*)?$/

/**
 * Static assets pass through to the network. Only the realtime client chunk can be
 * made to fail, so the app's handling of a failed dynamic import is testable.
 */
export const assetHandlers = [
  http.get(REALTIME_CLIENT_CHUNK, () => {
    if (getScenario().realtimeClient === 'unavailable') return HttpResponse.error()
    return undefined
  }),
]
