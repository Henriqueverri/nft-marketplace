import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { ANA, BRUNO, login, logout } from './support/auth'
import { addFromDetail, applyCoupon, ethDisplay, GOLDEN_OPEN, recordedQuote, serverCarts, summary, VELVET_OPEN } from './support/cart'
import { requestCount, updateNftPrice, waitForRefusedReconnections } from './support/catalog'
import { callMockControl } from './support/mock-control'
import {
  anaOrderBody,
  apiToken,
  callApi,
  openApp,
  quoteWith,
  replayOrderEvent,
  resolveOrder,
  serverOrder,
  serverOrders,
  setOrderScenario,
} from './support/orders'

/**
 * Order lifecycle (F4C): settlement without reads, `order.updated`, recovery after a
 * refresh or a reconnection, isolation between users, the receipt and the server-side
 * wallet checks.
 */

const ORDER_READS = /^GET \/api\/orders/
const ONE_ORDER_READS = /^GET \/api\/orders\/ord_/

async function placeOrderFromCheckout(page: Page, testInfo: TestInfo, options: { coupon?: string } = {}) {
  await login(page, ANA)
  await addFromDetail(page, testInfo, VELVET_OPEN, 2)
  if (options.coupon) {
    await applyCoupon(page, options.coupon)
    await expect(summary(page).getByTestId('quote-discount')).toHaveText('(-) 0.02 ETH')
  }
  await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
  await expect(page).toHaveURL(/\/checkout$/)
  const review = page.getByTestId('checkout-review')
  await expect(review).not.toHaveAttribute('aria-busy', 'true')
  await expect(review.getByTestId('checkout-total')).toHaveText(/ETH$/)
  const quote = await recordedQuote(page, (await review.getAttribute('data-quote-id'))!)
  const connection = page.getByTestId('wallet-connection')
  await connection.getByRole('button', { name: 'Conectar carteira' }).click()
  await expect(connection.getByTestId('wallet-connection-status')).toHaveText('Carteira conectada')
  await review.getByRole('button', { name: 'Confirmar compra' }).click()
  await expect(page).toHaveURL(/\/orders\/ord_[a-z0-9]+$/)
  const orderId = new URL(page.url()).pathname.split('/').pop()!
  return { orderId, quote }
}

function orderStatus(page: Page) {
  return page.getByTestId('order-status')
}

test.describe('Order lifecycle @orders', () => {
  test('pending orders settle on time without being read, even after the page that created them is gone', async ({ page, context }) => {
    await openApp(page)
    const token = await apiToken(page, ANA)

    // confirm: settled by the mock on its own, no GET of the order.
    const confirmed = await callApi(page, 'POST', '/api/orders', {
      token,
      idempotencyKey: 'lifecycle-confirm-000001',
      body: anaOrderBody(await quoteWith(page, token, VELVET_OPEN, 1)),
    })
    expect(confirmed.body).toMatchObject({ status: 'pending', version: 1 })
    await expect.poll(async () => (await serverOrder(page, confirmed.body.orderId))?.status).toBe('confirmed')

    // reject: the same, ending rejected.
    await setOrderScenario(page, { payment: 'reject' })
    const rejected = await callApi(page, 'POST', '/api/orders', {
      token,
      idempotencyKey: 'lifecycle-reject-0000001',
      body: anaOrderBody(await quoteWith(page, token, GOLDEN_OPEN, 1)),
    })
    await expect.poll(async () => (await serverOrder(page, rejected.body.orderId))?.status).toBe('rejected')

    // hold: still pending well past the settle time, until the control resolves it.
    await setOrderScenario(page, { payment: 'hold' })
    const held = await callApi(page, 'POST', '/api/orders', {
      token,
      idempotencyKey: 'lifecycle-hold-000000001',
      body: anaOrderBody(await quoteWith(page, token, VELVET_OPEN, 1)),
    })
    await page.waitForTimeout(2500)
    expect(await serverOrder(page, held.body.orderId)).toMatchObject({ status: 'pending', version: 1 })
    expect((await resolveOrder(page, held.body.orderId, 'confirmed')).body).toMatchObject({ status: 'confirmed', version: 2 })
    // Terminal: a second settlement changes nothing.
    expect((await resolveOrder(page, held.body.orderId, 'rejected')).status).toBe(409)
    expect(await serverOrder(page, held.body.orderId)).toMatchObject({ status: 'confirmed', version: 2 })
    expect(await requestCount(page, ORDER_READS)).toBe(0)

    // An order created right before its page closes settles in the next page that runs the mock.
    await setOrderScenario(page, { payment: 'confirm' })
    const orphan = await callApi(page, 'POST', '/api/orders', {
      token,
      idempotencyKey: 'lifecycle-orphan-0000001',
      body: anaOrderBody(await quoteWith(page, token, GOLDEN_OPEN, 1)),
    })
    await page.close()
    const next = await context.newPage()
    await openApp(next)
    expect(await serverOrder(next, orphan.body.orderId)).toMatchObject({ status: 'pending' })
    await expect.poll(async () => (await serverOrder(next, orphan.body.orderId))?.status).toBe('confirmed')
    expect(await requestCount(next, ORDER_READS)).toBe(0)
  })

  test('the receipt follows order.updated, ignores duplicate and old events and never changes', async ({ page }, testInfo) => {
    const { orderId, quote } = await placeOrderFromCheckout(page, testInfo, { coupon: 'KURIO10' })

    // Settled by the mock and delivered by the event: no click on "Atualizar status".
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'confirmed', { timeout: 10_000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Pedido confirmado' })).toBeFocused()
    await expect(orderStatus(page)).toHaveAttribute('data-version', '2')

    const receipt = page.getByTestId('order-receipt')
    const line = receipt.getByTestId('receipt-line')
    await expect(line).toHaveCount(1)
    await expect(line).toContainText(VELVET_OPEN.nft.name)
    await expect(line).toContainText(`Edição ${VELVET_OPEN.edition}`)
    await expect(line.getByTestId('receipt-line-quantity')).toHaveText(`2 × ${ethDisplay(quote.lines[0].unitPriceEth)}`)
    await expect(line.getByTestId('receipt-line-total')).toHaveText(ethDisplay(quote.lines[0].lineTotalEth))
    await expect(receipt.getByTestId('receipt-subtotal')).toHaveText(ethDisplay(quote.subtotalEth))
    await expect(receipt.getByTestId('receipt-discount')).toHaveText(`(-) ${ethDisplay(quote.discountEth)}`)
    await expect(receipt.getByText('Desconto (cupom KURIO10)')).toBeVisible()
    await expect(receipt.getByTestId('receipt-fee')).toHaveText(ethDisplay(quote.networkFeeEth))
    await expect(receipt.getByTestId('order-total')).toHaveText(ethDisplay(quote.totalEth))
    await expect(receipt.getByTestId('receipt-buyer')).toHaveText(`Ana Costa · ${ANA.email}`)
    await expect(receipt.getByTestId('receipt-wallet')).toContainText('Carteira principal da Ana · 0x')
    await expect(receipt.getByTestId('receipt-network')).toHaveText('Ethereum (ETH)')
    const hash = (await receipt.getByTestId('receipt-transaction').textContent())!
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/)

    // The explorer reference is a dialog that says it is simulated; it links nowhere.
    await page.getByRole('button', { name: 'Ver transação no explorador' }).click()
    const dialog = page.getByRole('dialog', { name: 'Transação simulada' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('nenhuma transação foi registrada na rede Ethereum')
    await expect(dialog.getByTestId('explorer-url')).toHaveText(`https://etherscan.io/tx/${hash}`)
    await expect(dialog.getByRole('link')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Fechar' }).click()
    await expect(dialog).toHaveCount(0)

    // Duplicate (same eventId) and old (version 1, "pending") events change nothing and read nothing.
    const ignored = Number(await page.getByTestId('realtime-events-ignored').textContent())
    const applied = Number(await page.getByTestId('realtime-events-applied').textContent())
    const reads = await requestCount(page, ONE_ORDER_READS)
    expect((await replayOrderEvent(page, orderId, 'duplicate')).delivered).toBe(1)
    await expect(page.getByTestId('realtime-events-ignored')).toHaveText(String(ignored + 1))
    const stale = await replayOrderEvent(page, orderId, 'stale')
    expect(stale).toMatchObject({ version: 1, delivered: 1 })
    await expect(page.getByTestId('realtime-events-applied')).toHaveText(String(applied + 1))
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'confirmed')
    await expect(page.getByRole('heading', { level: 1, name: 'Pedido confirmado' })).toBeVisible()
    expect(await requestCount(page, ONE_ORDER_READS)).toBe(reads)

    // A later price change does not touch the frozen receipt.
    await updateNftPrice(page, VELVET_OPEN.nft.id, '0.5')
    await page.reload()
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'confirmed')
    await expect(receipt.getByTestId('receipt-line-total')).toHaveText(ethDisplay(quote.lines[0].lineTotalEth))
    await expect(receipt.getByTestId('order-total')).toHaveText(ethDisplay(quote.totalEth))
    await expect(receipt.getByTestId('receipt-transaction')).toHaveText(hash)
  })

  test('a pending order is recovered after a refresh and a missed settlement is reconciled on reconnection', async ({ page }, testInfo) => {
    await openApp(page)
    await setOrderScenario(page, { payment: 'hold' })
    const { orderId } = await placeOrderFromCheckout(page, testInfo)

    // Pending has its own screen: no confirmation, no transaction.
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'pending')
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento em processamento' })).toBeVisible()
    await expect(page.getByTestId('receipt-transaction')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ver transação no explorador' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Resumo do pedido' })).toBeVisible()

    await page.reload()
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'pending')

    // Opening the app elsewhere recovers the pending order from the server.
    await openApp(page)
    const notice = page.getByTestId('order-notice').and(page.locator(`[data-order-id="${orderId}"]`))
    await expect(notice).toHaveAttribute('data-status', 'pending')
    await expect(notice).toContainText('Ainda não há confirmação.')
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')

    // The settlement happens while the socket is down: its event is lost.
    await callMockControl(page, '/__mock/socket/block', 'POST', { blocked: true })
    await expect(page.getByTestId('realtime-state')).toHaveText('desconectado')
    expect((await resolveOrder(page, orderId, 'rejected')).body.status).toBe('rejected')
    await waitForRefusedReconnections(page, 2)
    await expect(notice).toHaveAttribute('data-status', 'pending')

    // Back online, REST reconciles it.
    await callMockControl(page, '/__mock/socket/block', 'POST', { blocked: false })
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado', { timeout: 15_000 })
    await expect(notice).toHaveAttribute('data-status', 'rejected')
    await expect(notice).toContainText('O pagamento do seu pedido foi recusado.')

    await notice.getByRole('link', { name: 'Ver pedido' }).click()
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'rejected')
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento recusado' })).toBeVisible()
    await expect(page.getByTestId('order-rejection')).toContainText('Nenhum valor foi cobrado')
    await expect(page.getByTestId('receipt-transaction')).toHaveCount(0)
    await expect(page.getByTestId('order-notice')).toHaveCount(0)
    expect(await serverOrders(page)).toHaveLength(1)
  })

  test('after a refresh, an attempt whose answer was lost finds its order instead of sending again', async ({ page }, testInfo) => {
    await openApp(page)
    await setOrderScenario(page, { payment: 'hold' })
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN, 1)
    await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
    const review = page.getByTestId('checkout-review')
    await expect(review.getByTestId('checkout-total')).toHaveText(/ETH$/)
    const connection = page.getByTestId('wallet-connection')
    await connection.getByRole('button', { name: 'Conectar carteira' }).click()
    await expect(connection.getByTestId('wallet-connection-status')).toHaveText('Carteira conectada')
    // The server creates the order at once and holds its answer.
    await callMockControl(page, '/__mock/network/delays', 'POST', {
      pathPrefix: '/api/orders',
      method: 'POST',
      delaysMs: [10_000],
      phase: 'response',
    })
    await review.getByRole('button', { name: 'Confirmar compra' }).click()
    await expect.poll(async () => (await serverOrders(page)).length).toBe(1)
    const [created] = await serverOrders(page)
    const stored = await page.evaluate(() => sessionStorage.getItem('kurio:draft:usr_ana:checkout.attempt'))
    expect(JSON.parse(stored!).key).toBe(created.idempotencyKey)

    await page.reload()
    const status = page.getByTestId('checkout-send-status')
    await expect(status).toHaveAttribute('data-recovered-order-id', created.orderId)
    await expect(status).toContainText('já tinha sido registrado; nada foi enviado de novo')
    expect(await requestCount(page, /^POST \/api\/orders$/)).toBe(0)
    expect(await page.evaluate(() => sessionStorage.getItem('kurio:draft:usr_ana:checkout.attempt'))).toBeNull()

    await status.getByRole('link', { name: 'Ver pedido' }).click()
    await expect(page).toHaveURL(new RegExp(`/orders/${created.orderId}$`))
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'pending')
    expect(await serverOrders(page)).toHaveLength(1)
  })

  test('after a refresh, an attempt whose order already settled and emptied the cart still leads to that order', async ({ page }, testInfo) => {
    await openApp(page)
    await setOrderScenario(page, {})
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN, 1)
    await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
    const review = page.getByTestId('checkout-review')
    await expect(review.getByTestId('checkout-total')).toHaveText(/ETH$/)
    const connection = page.getByTestId('wallet-connection')
    await connection.getByRole('button', { name: 'Conectar carteira' }).click()
    await expect(connection.getByTestId('wallet-connection-status')).toHaveText('Carteira conectada')
    await callMockControl(page, '/__mock/network/delays', 'POST', {
      pathPrefix: '/api/orders',
      method: 'POST',
      delaysMs: [10_000],
      phase: 'response',
    })
    await review.getByRole('button', { name: 'Confirmar compra' }).click()
    // The order confirms while its answer is held; the attempt stays on screen.
    await expect.poll(async () => (await serverOrders(page))[0]?.status).toBe('confirmed')
    await expect(review.getByRole('button', { name: 'Enviando pedido…' })).toBeVisible()
    await expect(page.getByTestId('checkout-empty')).toHaveCount(0)
    const [created] = await serverOrders(page)

    await page.reload()
    const status = page.getByTestId('checkout-send-status')
    await expect(status).toHaveAttribute('data-recovered-order-id', created.orderId)
    await expect(page.getByTestId('checkout-empty')).toHaveCount(0)
    expect(await requestCount(page, /^POST \/api\/orders$/)).toBe(0)

    await status.getByRole('link', { name: 'Ver pedido' }).click()
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'confirmed')
    expect(await serverOrders(page)).toHaveLength(1)
  })

  test("another user's order events never reach the current user's screen", async ({ page }, testInfo) => {
    await openApp(page)
    await setOrderScenario(page, { payment: 'hold' })
    const { orderId } = await placeOrderFromCheckout(page, testInfo)
    await expect(orderStatus(page)).toHaveAttribute('data-status', 'pending')

    await logout(page)
    await login(page, BRUNO)
    await expect(page.getByTestId('realtime-identity')).toHaveText(BRUNO.id)
    await expect(page.getByTestId('order-notice')).toHaveCount(0)

    // Ana's order is not Bruno's, even by URL.
    await page.goto(`/orders/${orderId}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Pedido não encontrado' })).toBeVisible()
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')

    const ignored = Number(await page.getByTestId('realtime-events-ignored').textContent())
    const reads = await requestCount(page, ONE_ORDER_READS)
    // Settling Ana's order notifies only Ana's connections.
    expect((await resolveOrder(page, orderId, 'confirmed')).body.status).toBe('confirmed')
    // A routing bug broadcasts Ana's event to everyone: Bruno's client drops it.
    expect((await replayOrderEvent(page, orderId, 'duplicate', 'broadcast')).delivered).toBe(1)
    await expect(page.getByTestId('realtime-events-ignored')).toHaveText(String(ignored + 1))
    await expect(page.getByRole('heading', { level: 1, name: 'Pedido não encontrado' })).toBeVisible()
    await expect(page.getByTestId('order-notice')).toHaveCount(0)
    expect(await requestCount(page, ONE_ORDER_READS)).toBe(reads)
  })

  test('the server refuses a wallet or a network the order cannot use', async ({ page }) => {
    await openApp(page)
    const token = await apiToken(page, ANA)
    const quote = await quoteWith(page, token, VELVET_OPEN, 1)
    const send = (key: string, overrides: Record<string, unknown>) =>
      callApi(page, 'POST', '/api/orders', { token, idempotencyKey: key, body: anaOrderBody(quote, overrides) })

    const otherUsersWallet = await send('wallet-check-00000001', { walletId: 'wal_bruno1' })
    expect(otherUsersWallet.status).toBe(422)
    expect(otherUsersWallet.body.error?.fieldErrors).toHaveProperty('walletId')

    const unknownWallet = await send('wallet-check-00000002', { walletId: 'wal_nao_existe' })
    expect(unknownWallet.status).toBe(422)

    const otherNetwork = await send('wallet-check-00000003', { walletId: 'wal_ana2', networkId: 'ethereum' })
    expect(otherNetwork.status).toBe(422)
    expect(otherNetwork.body.error?.fieldErrors).toHaveProperty('networkId')

    const noWalletNetwork = await send('wallet-check-00000004', { networkId: 'solana' })
    expect(noWalletNetwork.status).toBe(422)
    expect(noWalletNetwork.body.error?.fieldErrors).toHaveProperty('networkId')

    expect(await serverOrders(page)).toHaveLength(0)
    expect((await serverCarts(page)).users.usr_ana.items).toEqual([
      expect.objectContaining({ editionId: VELVET_OPEN.editionId, quantity: 1 }),
    ])

    // The same quote with Ana's own wallet and its network goes through.
    const valid = await send('wallet-check-00000005', {})
    expect(valid.status).toBe(201)
  })
})
