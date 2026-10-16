import { expect, test } from '@playwright/test'
import { callMockControl, type MockStatus } from './support/mock-control'

/**
 * Proof of concept for Socket.IO over MSW (@mswjs/socket.io-binding).
 * Every assertion observes the UI fed by socket.io-client or the mock's own state;
 * nothing here touches app state directly.
 */
test.describe('socket.io over msw @smoke @realtime', () => {
  test('receives the hello event from the mock server without touching the network', async ({
    page,
  }) => {
    // MSW handles the socket inside the page; a WebSocket seen by Playwright would mean
    // the connection escaped the mock and reached the real network.
    const networkWebSockets: string[] = []
    page.on('websocket', (socket) => networkWebSockets.push(socket.url()))

    await page.goto('/')
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')

    const firstConnectionId = await page.getByTestId('realtime-last-hello').textContent()
    expect(firstConnectionId).toMatch(/\S{6,}/)
    await expect(page.getByTestId('realtime-connects')).toHaveText('1')
    expect(networkWebSockets).toEqual([])
  })

  test('stays connected for more than 60 seconds', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/')
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')

    // socket.io-client drops the connection after pingInterval + pingTimeout (30s)
    // without engine.io pings; 65s covers two heartbeat cycles.
    await page.waitForTimeout(65_000)

    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    await expect(page.getByTestId('realtime-connects')).toHaveText('1')
    await expect(page.getByTestId('realtime-disconnects')).toHaveText('0')
    const status = await callMockControl<MockStatus>(page, '/__mock/status')
    expect(status.socketConnections).toBe(1)
  })

  test('a realtime client that fails to load is reported and can be retried', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')

    // Abort the on-demand chunk explicitly: Vercel's immutable /assets cache can satisfy
    // socket-client-*.js without MSW ever failing the import, so waiting for a request is
    // not enough. Playwright routing forces a load failure local and on the public deploy.
    const socketClientChunk = /\/socket-client-[\w-]+\.js(?:\?.*)?$/
    await page.route(socketClientChunk, (route) => route.abort())
    await callMockControl(page, '/__mock/scenario', 'PUT', {
      latencyMs: 100,
      failure: 'none',
      realtimeClient: 'unavailable',
    })
    await page.reload()

    await expect(page.getByTestId('realtime-state')).toHaveText('indisponível')
    const notice = page.getByRole('alert').filter({ hasText: 'Atualizações em tempo real indisponíveis' })
    await expect(notice).toBeVisible()
    await expect(notice).not.toContainText(/token|socket|import|chunk/i)
    await expect(page.getByTestId('realtime-connects')).toHaveText('0')
    await expect(page.getByTestId('realtime-last-hello')).toHaveText('—')
    let status = await callMockControl<MockStatus>(page, '/__mock/status')
    expect(status.socketConnections).toBe(0)

    // Retrying while the chunk still fails keeps the honest state.
    await notice.getByRole('button', { name: 'Tentar conectar novamente' }).click()
    await expect(page.getByTestId('realtime-state')).toHaveText('indisponível')

    await page.unroute(socketClientChunk)
    await callMockControl(page, '/__mock/scenario', 'PUT', { latencyMs: 100, failure: 'none' })
    await page.getByRole('button', { name: 'Tentar conectar novamente' }).click()
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    await expect(notice).toHaveCount(0)
    await expect(page.getByTestId('realtime-connects')).toHaveText('1')
    status = await callMockControl<MockStatus>(page, '/__mock/status')
    expect(status.socketConnections).toBe(1)
  })

  test('reconnects after the server closes the connection', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    const firstConnectionId = await page.getByTestId('realtime-last-hello').textContent()

    const result = await callMockControl<{ closed: number }>(
      page,
      '/__mock/socket/disconnect',
      'POST',
    )
    expect(result.closed).toBe(1)

    await expect(page.getByTestId('realtime-disconnects')).toHaveText('1')
    await expect(page.getByTestId('realtime-disconnect-reason')).toHaveText('transport close')
    await expect(page.getByTestId('realtime-connects')).toHaveText('2')
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    await expect(page.getByTestId('realtime-last-hello')).not.toHaveText(firstConnectionId ?? '')

    const status = await callMockControl<MockStatus>(page, '/__mock/status')
    expect(status.socketConnections).toBe(1)
  })
})
