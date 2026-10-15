import { expect, test } from '@playwright/test'
import { authHeading } from './support/auth'
import { callMockControl, type MockStatus } from './support/mock-control'

/** The hero headline differs between the desktop and mobile layouts (Figma). */
const HOME_HEADING = /^Seja dono d[oa] (futuro da arte|cultura) digital$/i

const publicRoutes = [
  { path: '/', heading: HOME_HEADING },
  { path: '/nfts/emerald-ape-042', heading: 'Emerald Ape #042' },
  { path: '/cart', heading: 'Carrinho de NFTs' },
]

const privateRoutes = ['/checkout', '/orders/order-123', '/account/profile', '/account/wallets', '/account/favorites']

test.describe('smoke @smoke', () => {
  test('opens the home route', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Kurio/)
    await expect(page.getByRole('heading', { level: 1, name: HOME_HEADING })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
  })

  for (const route of publicRoutes) {
    test(`direct access to ${route.path}`, async ({ page }) => {
      await page.goto(route.path)
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
    })
  }

  for (const mode of ['login', 'signup'] as const) {
    test(`direct access to /${mode}`, async ({ page }, testInfo) => {
      await page.goto(`/${mode}`)
      await expect(page.getByRole('heading', { level: 1, name: authHeading(mode, testInfo) })).toBeVisible()
    })
  }

  for (const path of privateRoutes) {
    test(`direct access to ${path} without a session goes to login`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === path)
      await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
    })
  }

  test('refresh on an internal route keeps the screen', async ({ page }) => {
    await page.goto('/cart')
    await expect(page.getByRole('heading', { level: 1, name: 'Carrinho de NFTs' })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/\/cart$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Carrinho de NFTs' })).toBeVisible()
  })

  test('client-side navigation works', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Carrinho' }).click()
    await expect(page).toHaveURL(/\/cart$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Carrinho de NFTs' })).toBeVisible()
  })

  test('unknown route shows the 404 page', async ({ page }) => {
    await page.goto('/rota-que-nao-existe')
    await expect(page.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible()
    await page.getByRole('link', { name: 'Voltar ao início' }).click()
    await expect(page.getByRole('heading', { level: 1, name: HOME_HEADING })).toBeVisible()
  })

  test('MSW worker controls the page and answers the mock API', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mocks-state')).toHaveText('ativos')

    const workerUrl = await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
    expect(workerUrl).toMatch(/\/mockServiceWorker\.js$/)

    const status = await callMockControl<MockStatus>(page, '/__mock/status')
    expect(status.mocks).toBe(true)
  })

  test('Socket.IO connects through the mock and receives an event', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    await expect(page.getByTestId('realtime-last-hello')).not.toHaveText('—')
    await expect(page.getByTestId('realtime-identity')).toHaveText('anônima')

    const status = await callMockControl<MockStatus>(page, '/__mock/status')
    expect(status.socketConnections).toBe(1)
  })

  test('deployed build matches the expected commit', async ({ page }) => {
    const expected = process.env.EXPECTED_COMMIT_SHA
    test.skip(!expected, 'EXPECTED_COMMIT_SHA is only set when checking a deploy')
    await page.goto('/')
    await expect(page.getByTestId('commit-sha')).toHaveAttribute('data-commit', expected!)
  })
})
