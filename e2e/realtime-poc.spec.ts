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
