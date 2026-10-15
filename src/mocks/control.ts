import { http, HttpResponse } from 'msw'
import { closeAllConnections, getActiveConnectionCount } from './socket'

/**
 * Mock control API. It lives on the network layer so that tests and the demo
 * drive the simulation through MSW, never by touching app state directly.
 */
export const controlHandlers = [
  http.get('/__mock/status', () =>
    HttpResponse.json({
      mocks: true,
      socketConnections: getActiveConnectionCount(),
    }),
  ),

  http.post('/__mock/socket/disconnect', () =>
    HttpResponse.json({ closed: closeAllConnections() }),
  ),
]
