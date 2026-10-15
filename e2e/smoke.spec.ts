import { expect, test } from '@playwright/test'
import { callMockControl, type MockStatus } from './support/mock-control'

const plannedRoutes = [
  { path: '/', heading: 'Início' },
  { path: '/nfts/emerald-ape-042', heading: 'Detalhes do NFT' },
  { path: '/cart', heading: 'Carrinho de NFTs' },
  { path: '/checkout', heading: 'Pagamento' },
  { path: '/orders/order-123', heading: 'Confirmação de pedido' },
  { path: '/login', heading: 'Entrar' },
  { path: '/signup', heading: 'Criar conta' },
  { path: '/account/profile', heading: 'Perfil do colecionador' },
  { path: '/account/wallets', heading: 'Carteiras' },
  { path: '/account/favorites', heading: 'Lista de interesse' },
]

test.describe('smoke @smoke', () => {
  test('opens the home route', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Kurio/)
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible()
  })

  for (const route of plannedRoutes) {
    test(`direct access to ${route.path}`, async ({ page }) => {
      await page.goto(route.path)
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
    })
  }

  test('refresh on an internal route keeps the screen', async ({ page }) => {
    await page.goto('/account/wallets')
    await expect(page.getByRole('heading', { level: 1, name: 'Carteiras' })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(/\/account\/wallets$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Carteiras' })).toBeVisible()
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
    await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible()
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
