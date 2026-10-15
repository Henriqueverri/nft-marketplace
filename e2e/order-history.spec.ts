import { expect, test, type Page } from '@playwright/test'
import { ANA, BRUNO, login } from './support/auth'
import { GOLDEN_OPEN, VELVET_OPEN, type SeedEdition } from './support/cart'
import {
  anaOrderBody,
  apiToken,
  callApi,
  openApp,
  quoteWith,
  resolveOrder,
  setOrderScenario,
  type OrderBody,
} from './support/orders'

interface HistoryOrder extends OrderBody {
  createdAt: string
}

async function createHeldOrder(page: Page, token: string, edition: SeedEdition, key: string) {
  const quote = await quoteWith(page, token, edition, 1)
  const result = await callApi<HistoryOrder>(page, 'POST', '/api/orders', {
    token,
    idempotencyKey: key,
    body: anaOrderBody(quote),
  })
  expect(result.status).toBe(201)
  return result.body
}

async function createThreeStatuses(page: Page) {
  await openApp(page)
  const token = await apiToken(page, ANA)
  await setOrderScenario(page, { payment: 'hold' })

  const confirmed = await createHeldOrder(page, token, VELVET_OPEN, 'history-confirmed-0001')
  expect((await resolveOrder(page, confirmed.orderId, 'confirmed')).status).toBe(200)

  const rejected = await createHeldOrder(page, token, GOLDEN_OPEN, 'history-rejected-00001')
  expect((await resolveOrder(page, rejected.orderId, 'rejected')).status).toBe(200)

  const pending = await createHeldOrder(page, token, VELVET_OPEN, 'history-pending-0000001')
  return { confirmed, rejected, pending }
}

test.describe('Order history @orders-history', () => {
  test('lists newest first with every status and opens the existing receipt', async ({ page }) => {
    const created = await createThreeStatuses(page)
    await login(page, ANA, '/login?redirect=/account/orders')

    const items = page.getByTestId('order-history-item')
    await expect(items).toHaveCount(3)
    await expect(items.nth(0)).toHaveAttribute('data-order-id', created.pending.orderId)
    await expect(items.nth(1)).toHaveAttribute('data-order-id', created.rejected.orderId)
    await expect(items.nth(2)).toHaveAttribute('data-order-id', created.confirmed.orderId)
    await expect(items.nth(0)).toHaveAttribute('data-status', 'pending')
    await expect(items.nth(1)).toHaveAttribute('data-status', 'rejected')
    await expect(items.nth(2)).toHaveAttribute('data-status', 'confirmed')

    const dates = await items.evaluateAll((cards) => cards.map((card) => Date.parse(card.getAttribute('data-created-at')!)))
    expect(dates).toEqual([...dates].sort((a, b) => b - a))
    // A rejected order preserves its cart line. The following pending order therefore
    // contains the rejected Golden edition plus the newly added Velvet edition.
    const pendingLines = items.nth(0).getByRole('listitem')
    await expect(pendingLines).toHaveCount(2)
    await expect(pendingLines).toContainText([GOLDEN_OPEN.nft.name, VELVET_OPEN.nft.name])
    await expect(pendingLines.getByText(/1 unidade · Edição Aberta/)).toHaveCount(2)
    await expect(items.nth(0).getByTestId('order-history-total')).toHaveText(/ETH$/)

    await items.nth(2).getByRole('link', { name: `Ver recibo do pedido ${created.confirmed.orderId}` }).click()
    await expect(page).toHaveURL(new RegExp(`/orders/${created.confirmed.orderId}$`))
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed')
    await expect(page.getByRole('heading', { level: 2, name: 'Recibo' })).toBeVisible()
  })

  test('shows an empty state with a way back to the marketplace', async ({ page }) => {
    await login(page, BRUNO, '/login?redirect=/account/orders')
    await expect(page.getByTestId('orders-empty')).toContainText('Você ainda não fez nenhum pedido')
    const explore = page.getByRole('link', { name: 'Explorar marketplace' })
    await expect(explore).toHaveAttribute('href', '/#catalogo')
  })

  test('does not expose another user orders', async ({ page }) => {
    await openApp(page)
    const token = await apiToken(page, ANA)
    await setOrderScenario(page, { payment: 'hold' })
    const anaOrder = await createHeldOrder(page, token, VELVET_OPEN, 'history-isolation-00001')

    await login(page, BRUNO, '/login?redirect=/account/orders')
    await expect(page.getByTestId('orders-empty')).toBeVisible()
    await expect(page.getByText(anaOrder.orderId)).toHaveCount(0)
    await page.goto(`/orders/${anaOrder.orderId}`)
    await expect(page.getByRole('heading', { name: 'Pedido não encontrado' })).toBeVisible()
  })

  test('updates a pending card through the existing order.updated flow', async ({ page }) => {
    await openApp(page)
    const token = await apiToken(page, ANA)
    await setOrderScenario(page, { payment: 'hold' })
    const order = await createHeldOrder(page, token, VELVET_OPEN, 'history-realtime-000001')

    await login(page, ANA, '/login?redirect=/account/orders')
    const card = page.getByTestId('order-history-item').filter({ hasText: order.orderId })
    await expect(card).toHaveAttribute('data-status', 'pending')

    expect((await resolveOrder(page, order.orderId, 'confirmed')).status).toBe(200)
    await expect(card).toHaveAttribute('data-status', 'confirmed')
    await expect(card.getByLabel('Status do pedido: Confirmado')).toBeVisible()
    await expect(card.getByRole('link', { name: `Ver recibo do pedido ${order.orderId}` })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
