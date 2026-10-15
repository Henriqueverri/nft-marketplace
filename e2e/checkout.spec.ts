import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { ANA, login } from './support/auth'
import { addFromDetail, ethDisplay, recordedQuote, summary, VELVET_OPEN } from './support/cart'
import { queueNetwork, requestCount, updateNftPrice, waitForMockIdle } from './support/catalog'
import { callMockControl } from './support/mock-control'

/**
 * Checkout (F4B): the payment form, the wallet connection, the review of the server's
 * quote and the idempotent POST /api/orders, through the UI on both layouts.
 */

interface ServerOrder {
  orderId: string
  userId: string
  status: string
  idempotencyKey: string
}

const ATTEMPT_KEY = 'kurio:draft:usr_ana:checkout.attempt'
const ORDER_POSTS = /^POST \/api\/orders$/

async function serverOrders(page: Page): Promise<ServerOrder[]> {
  return (await callMockControl<{ orders: ServerOrder[] }>(page, '/__mock/orders')).orders
}

function setScenario(
  page: Page,
  scenario: { latencyMs?: number; payment?: 'confirm' | 'reject' | 'hold'; wallet?: 'approve' | 'reject' },
) {
  return callMockControl(page, '/__mock/scenario', 'PUT', { latencyMs: 100, failure: 'none', ...scenario })
}

function review(page: Page): Locator {
  return page.getByTestId('checkout-review')
}

function confirmButton(page: Page): Locator {
  return review(page).getByRole('button', { name: /^(Confirmar compra|Enviando pedido…)$/ })
}

function connection(page: Page): Locator {
  return page.getByTestId('wallet-connection')
}

/** Ana, signed in, with a cart, on the payment page reached from the cart. */
async function openCheckout(page: Page, testInfo: TestInfo, quantity = 2) {
  await login(page, ANA)
  await addFromDetail(page, testInfo, VELVET_OPEN, quantity)
  await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
  await expect(page).toHaveURL(/\/checkout$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Pagamento' })).toBeVisible()
  await expectReviewMatchesQuote(page)
}

/** The review on screen is the server's quote, value by value. Returns its id. */
async function expectReviewMatchesQuote(page: Page): Promise<string> {
  const panel = review(page)
  await expect(panel).not.toHaveAttribute('aria-busy', 'true')
  await expect(panel.getByTestId('checkout-total')).toHaveText(/ETH$/)
  const quoteId = (await panel.getAttribute('data-quote-id'))!
  expect(quoteId).toMatch(/^qt_/)
  const quote = await recordedQuote(page, quoteId)
  await expect(panel.getByTestId('checkout-subtotal')).toHaveText(ethDisplay(quote.subtotalEth))
  await expect(panel.getByTestId('checkout-fee')).toHaveText(ethDisplay(quote.networkFeeEth))
  await expect(panel.getByTestId('checkout-total')).toHaveText(ethDisplay(quote.totalEth))
  await expect(panel.getByTestId('checkout-line')).toHaveCount(quote.lines.length)
  return quoteId
}

async function connectWallet(page: Page) {
  await expect(connection(page).getByTestId('wallet-connection-status')).toHaveText('Carteira não conectada')
  await connection(page).getByRole('button', { name: 'Conectar carteira' }).click()
  await expect(connection(page).getByTestId('wallet-connection-status')).toHaveText('Carteira conectada')
}

async function expectOrderPage(page: Page, status: 'pending' | 'confirmed' | 'rejected'): Promise<string> {
  await expect(page).toHaveURL(/\/orders\/ord_[a-z0-9]+$/)
  await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', status)
  return new URL(page.url()).pathname.split('/').pop()!
}

test.describe('Checkout @checkout', () => {
  test('a valid checkout creates one pending order and only says confirmed once it is', async ({ page }, testInfo) => {
    await openCheckout(page, testInfo)
    await expect(page.getByLabel('Nome completo')).toHaveValue('Ana Costa')
    await expect(page.getByLabel('E-mail')).toHaveValue(ANA.email)
    await expect(page.getByRole('radio', { name: /^Ethereum/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: /^Carteira principal da Ana/ })).toBeChecked()
    const quote = await recordedQuote(page, (await review(page).getAttribute('data-quote-id'))!)

    await connectWallet(page)
    await confirmButton(page).click()

    const orderId = await expectOrderPage(page, 'pending')
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento em processamento' })).toBeVisible()
    await expect(page.getByText('A compra ainda não foi confirmada.', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toHaveCount(0)
    await expect(page.getByTestId('order-id')).toHaveText(orderId)
    await expect(page.getByTestId('order-total')).toHaveText(ethDisplay(quote.totalEth))

    const orders = await serverOrders(page)
    expect(orders).toHaveLength(1)
    expect(orders[0]).toMatchObject({ orderId, userId: 'usr_ana' })
    // The attempt is settled: nothing is left to resend.
    expect(await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY)).toBeNull()

    // The default payment settles as confirmed shortly after; the page follows it (order.updated) and says so only then.
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'confirmed', { timeout: 10_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Pedido confirmado' })).toBeVisible()
  })

  test('invalid fields are reported next to them, keep the valid data and send nothing', async ({ page }, testInfo) => {
    await openCheckout(page, testInfo)
    await connectWallet(page)
    const name = page.getByLabel('Nome completo')
    const email = page.getByLabel('E-mail')

    await name.fill('  ')
    await email.fill('ana-sem-arroba')
    await confirmButton(page).click()

    await expect(name).toBeFocused()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toHaveAccessibleDescription('Informe seu nome completo.')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAccessibleDescription(/e-mail/i)
    await expect(page).toHaveURL(/\/checkout$/)

    // Fixing one field keeps the other one's value and error.
    await name.fill('Ana Maria Costa')
    await confirmButton(page).click()
    await expect(email).toBeFocused()
    await expect(name).toHaveValue('Ana Maria Costa')
    await expect(name).not.toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveValue('ana-sem-arroba')

    expect(await requestCount(page, ORDER_POSTS)).toBe(0)
    expect(await serverOrders(page)).toHaveLength(0)

    await email.fill('ana.maria@kurio.test')
    await confirmButton(page).click()
    const orderId = await expectOrderPage(page, 'pending')
    expect((await serverOrders(page)).map((order) => order.orderId)).toEqual([orderId])
  })

  test('wallet selection, refusal and disconnection by the wallet app', async ({ page }, testInfo) => {
    await openCheckout(page, testInfo)
    await expect(page.getByRole('radio', { name: /^Solana/ })).toBeDisabled()
    await expect(page.getByRole('radio', { name: /^Solana/ })).toHaveAccessibleName(/Nenhuma carteira cadastrada/)

    // Polygon only offers Ana's Polygon wallet.
    await page.getByRole('radio', { name: /^Polygon/ }).check()
    await expect(page.getByRole('radio', { name: /^Polygon/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: /^Reserva Polygon/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: /^Carteira principal da Ana/ })).toHaveCount(0)

    // Without a connection, nothing is sent.
    await confirmButton(page).click()
    await expect(page.getByText('Conecte a carteira para continuar.')).toBeVisible()
    expect(await requestCount(page, ORDER_POSTS)).toBe(0)

    // The wallet app refuses: an error, still not connected, data kept.
    await setScenario(page, { wallet: 'reject' })
    await connection(page).getByRole('button', { name: 'Conectar carteira' }).click()
    await expect(connection(page).getByRole('alert')).toContainText('foi recusada na carteira. Tente de novo ou escolha outra carteira.')
    await expect(connection(page).getByTestId('wallet-connection-status')).toHaveText('Carteira não conectada')
    await expect(page.getByRole('radio', { name: /^Reserva Polygon/ })).toBeChecked()

    await setScenario(page, {})
    await connectWallet(page)
    await expect(connection(page).getByRole('alert')).toHaveCount(0)

    // The user disconnects and connects again from the page.
    await connection(page).getByRole('button', { name: 'Desconectar' }).click()
    await expect(connection(page).getByTestId('wallet-connection-status')).toHaveText('Carteira não conectada')
    await connectWallet(page)

    // The wallet app drops the connection behind the page: the send is stopped.
    await callMockControl(page, '/__mock/wallets/disconnect', 'POST', { userId: 'usr_ana' })
    await confirmButton(page).click()
    await expect(page.getByText('A carteira foi desconectada. Conecte de novo para continuar.')).toBeVisible()
    await expect(connection(page).getByTestId('wallet-connection-status')).toHaveText('Carteira não conectada')
    expect(await requestCount(page, ORDER_POSTS)).toBe(0)

    await connectWallet(page)
    await confirmButton(page).click()
    const orderId = await expectOrderPage(page, 'pending')
    await expect(page.getByTestId('receipt-wallet')).toContainText('Reserva Polygon')
    await expect(page.getByTestId('receipt-network')).toHaveText('Polygon (POL)')
    expect((await serverOrders(page)).map((order) => order.orderId)).toEqual([orderId])
  })

  test('repeated clicks while the order is being sent send it once', async ({ page }, testInfo) => {
    await openCheckout(page, testInfo)
    await connectWallet(page)
    await queueNetwork(page, { pathPrefix: '/api/orders', method: 'POST', delaysMs: [1500] })

    const button = confirmButton(page)
    await button.click()
    await expect(button).toHaveText('Enviando pedido…')
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await button.click({ force: true })
    await button.press('Enter')
    await button.click({ force: true })

    await expectOrderPage(page, 'pending')
    expect(await serverOrders(page)).toHaveLength(1)
    expect(await requestCount(page, ORDER_POSTS)).toBe(1)
  })

  test('after a timeout the retry resends the same key and body and gets the same order', async ({ page }, testInfo) => {
    test.slow()
    await openCheckout(page, testInfo)
    await connectWallet(page)
    // The server creates the order after the 800 ms latency; its answer is held 10 s more,
    // past the client's 10 s timeout.
    await setScenario(page, { latencyMs: 800 })
    await queueNetwork(page, { pathPrefix: '/api/orders', method: 'POST', delaysMs: [10_000], phase: 'response' })

    await confirmButton(page).click()
    const status = page.getByTestId('checkout-send-status')
    await expect(status).toContainText('Não recebemos a confirmação do envio do pedido', { timeout: 15_000 })
    await expect(status).not.toContainText('confirmado')
    await expect(page).toHaveURL(/\/checkout$/)

    const created = await serverOrders(page)
    expect(created).toHaveLength(1)
    const stored = JSON.parse((await page.evaluate((key) => sessionStorage.getItem(key), ATTEMPT_KEY))!) as {
      key: string
      request: unknown
    }
    expect(stored.key).toBe(created[0].idempotencyKey)

    // The order settled while the answer was lost; the replay returns it as it is now.
    await status.getByRole('button', { name: 'Tentar enviar de novo' }).click()
    const orderId = await expectOrderPage(page, 'confirmed')
    expect(orderId).toBe(created[0].orderId)
    expect(await serverOrders(page)).toHaveLength(1)
    expect(await requestCount(page, ORDER_POSTS)).toBe(2)
  })

  test('QUOTE_STALE shows the changes and the new total, and needs a new confirmation', async ({ page }, testInfo) => {
    await openCheckout(page, testInfo)
    await connectWallet(page)
    const firstQuote = await review(page).getAttribute('data-quote-id')
    const previous = await recordedQuote(page, firstQuote!)

    // The price changes and the page is not told (realtime unreachable): the server finds out.
    await callMockControl(page, '/__mock/socket/block', 'POST', { blocked: true })
    await updateNftPrice(page, VELVET_OPEN.nft.id, '0.15')
    await confirmButton(page).click()

    const notice = page.getByTestId('quote-changed')
    await expect(notice).toBeVisible()
    await expect(notice.getByRole('heading', { name: 'Os valores do pedido mudaram' })).toBeFocused()
    await expect(notice).toContainText(`o preço mudou de ${ethDisplay('0.1')} para ${ethDisplay('0.15')}`)
    await expect(notice.getByTestId('quote-changed-totals')).toContainText(`Total anterior: ${ethDisplay(previous.totalEth)}`)
    await expect(notice.getByTestId('quote-changed-totals')).toContainText('Novo total:')
    await expect(page).toHaveURL(/\/checkout$/)
    expect(await serverOrders(page)).toHaveLength(0)

    // No order with the new values until the user reviews them and confirms again.
    await expect(confirmButton(page)).toHaveAttribute('aria-disabled', 'true')
    await confirmButton(page).click({ force: true })
    expect(await requestCount(page, ORDER_POSTS)).toBe(1)

    await notice.getByRole('button', { name: 'Revisar novos valores' }).click()
    await expect(notice).toHaveCount(0)
    await expect(review(page).getByRole('heading', { name: 'Revisão do pedido' })).toBeFocused()
    const newQuoteId = await expectReviewMatchesQuote(page)
    expect(newQuoteId).not.toBe(firstQuote)
    const fresh = await recordedQuote(page, newQuoteId)
    expect(fresh.lines[0].unitPriceEth).toBe('0.15')
    expect(await serverOrders(page)).toHaveLength(0)

    await confirmButton(page).click()
    const orderId = await expectOrderPage(page, 'pending')
    await expect(page.getByTestId('order-total')).toHaveText(ethDisplay(fresh.totalEth))
    expect((await serverOrders(page)).map((order) => order.orderId)).toEqual([orderId])
  })

  test('a pending order stays pending and a rejected one is never shown as confirmed', async ({ page }, testInfo) => {
    await openCheckout(page, testInfo)
    await setScenario(page, { payment: 'hold' })
    await connectWallet(page)
    await confirmButton(page).click()

    const orderId = await expectOrderPage(page, 'pending')
    // Well past the settle delay, the held payment is still pending.
    await page.waitForTimeout(2000)
    await page.getByRole('button', { name: 'Atualizar status' }).click()
    await waitForMockIdle(page)
    await expect(page.getByRole('button', { name: 'Atualizar status' })).toBeVisible()
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'pending')
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento em processamento' })).toBeVisible()
    await expect(page.getByText('A compra ainda não foi confirmada.', { exact: false })).toBeVisible()

    await callMockControl(page, `/__mock/orders/${orderId}/resolve`, 'POST', { outcome: 'rejected' })
    await expectOrderPage(page, 'rejected')
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento recusado' })).toBeVisible()
    await expect(page.getByText('O pedido não foi concluído.', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Pedido confirmado' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Voltar ao carrinho' })).toBeVisible()
  })
})
