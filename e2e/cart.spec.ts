import { expect, test, type Page } from '@playwright/test'
import { ANA, BRUNO, isMobile, login, logout } from './support/auth'
import {
  addFromDetail,
  applyCoupon,
  cartItem,
  cartItems,
  couponInput,
  EMERALD_UNIQUE,
  expectBadge,
  expectSummaryMatchesQuote,
  GOLDEN_OPEN,
  GOLDEN_TEN,
  guestCartId,
  itemQuantity,
  itemTotal,
  recordedQuote,
  serverCarts,
  setStock,
  settledQuoteId,
  summary,
  VELVET_OPEN,
  type SeedEdition,
} from './support/cart'
import { announcer, queueNetwork, requestCount, setScenario, updateNftPrice, waitForMockIdle } from './support/catalog'
import { callMockControl } from './support/mock-control'

function quantityGroup(page: Page, entry: SeedEdition) {
  return cartItem(page, entry).getByRole('group', { name: `Quantidade de ${entry.nft.name}` })
}

function removeButton(page: Page, entry: SeedEdition) {
  return cartItem(page, entry).getByRole('button', { name: `Remover ${entry.nft.name} do carrinho` })
}

/** A request made straight to the cart API with this browser's visitor cart id. */
async function guestCartRequest(page: Page, method: 'PATCH' | 'POST', path: string, body: unknown) {
  return page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Cart-Id': window.localStorage.getItem('kurio:guest-cart') ?? '' },
        body: JSON.stringify(body),
      })
      return { status: response.status, body: (await response.json()) as { error?: { code: string; message: string } } }
    },
    { method, path, body },
  )
}

test.describe('Cart and quote @cart', () => {
  test('adds an NFT from its detail page; the badge, the list and the server agree', async ({ page }, testInfo) => {
    await page.goto('/')
    await expectBadge(page, testInfo, 0)
    expect(await guestCartId(page)).toBeNull()

    await addFromDetail(page, testInfo, GOLDEN_TEN, 2)
    const item = cartItem(page, GOLDEN_TEN)
    await expect(item).toContainText(`Edição: ${GOLDEN_TEN.edition}`)
    await expect(itemQuantity(item)).toHaveText('2')
    await expect(itemTotal(item)).toHaveText('3.38 ETH')
    await expectBadge(page, testInfo, 2)
    await expectSummaryMatchesQuote(page)

    const cartId = await guestCartId(page)
    expect(cartId).toMatch(/^gc_/)
    const carts = await serverCarts(page)
    expect(carts.guests[cartId!].items).toEqual([{ editionId: GOLDEN_TEN.editionId, quantity: 2, unitPriceEth: '1.69' }])
  })

  test('quantity changes are whole numbers within the stock and per-order limits', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN)
    const group = quantityGroup(page, VELVET_OPEN)
    const increase = group.getByRole('button', { name: `Aumentar quantidade de ${VELVET_OPEN.nft.name}` })
    const decrease = group.getByRole('button', { name: `Diminuir quantidade de ${VELVET_OPEN.nft.name}` })
    const item = cartItem(page, VELVET_OPEN)

    await expect(decrease).toBeDisabled()
    await increase.click()
    await expect(itemQuantity(item)).toHaveText('2')
    await increase.click()
    await expect(itemQuantity(item)).toHaveText('3')
    // The open edition allows 3 per order.
    await expect(increase).toBeDisabled()
    await expect(item.getByTestId('cart-item-limit')).toHaveText('Máx. 3')
    await expectBadge(page, testInfo, 3)
    await expectSummaryMatchesQuote(page)

    await decrease.click()
    await expect(itemQuantity(item)).toHaveText('2')
    await expect(increase).toBeEnabled()
    await expectSummaryMatchesQuote(page)

    // The server is the one enforcing the rules, whatever the client sends.
    const itemPath = `/api/cart/items/${VELVET_OPEN.editionId}`
    const fractional = await guestCartRequest(page, 'PATCH', itemPath, { quantity: 1.5 })
    expect(fractional.status).toBe(422)
    expect(fractional.body.error?.code).toBe('VALIDATION_FAILED')
    const zero = await guestCartRequest(page, 'PATCH', itemPath, { quantity: 0 })
    expect(zero.status).toBe(422)
    const overLimit = await guestCartRequest(page, 'PATCH', itemPath, { quantity: 4 })
    expect(overLimit.status).toBe(409)
    expect(overLimit.body.error).toMatchObject({ code: 'QUANTITY_LIMIT_EXCEEDED' })
    expect(overLimit.body.error?.message).toContain('o limite é de 3 por pedido')
    const addingOver = await guestCartRequest(page, 'POST', '/api/cart/items', {
      nftId: VELVET_OPEN.nft.id,
      editionId: VELVET_OPEN.editionId,
      quantity: 2,
    })
    expect(addingOver.status).toBe(409)
    expect(addingOver.body.error?.code).toBe('QUANTITY_LIMIT_EXCEEDED')
    const soldOut = await guestCartRequest(page, 'POST', '/api/cart/items', {
      nftId: 'emerald-ape-042',
      editionId: 'ed_emerald-ape-042-fifty',
      quantity: 1,
    })
    expect(soldOut.status).toBe(409)
    expect(soldOut.body.error?.code).toBe('OUT_OF_STOCK')

    const cartId = await guestCartId(page)
    expect((await serverCarts(page)).guests[cartId!].items).toEqual([
      { editionId: VELVET_OPEN.editionId, quantity: 2, unitPriceEth: VELVET_OPEN.price },
    ])
    await page.reload()
    await expect(itemQuantity(cartItem(page, VELVET_OPEN))).toHaveText('2')
  })

  test('removing items updates the list, the quote and the badge, down to the empty state', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await addFromDetail(page, testInfo, GOLDEN_OPEN, 2)
    await expect(cartItems(page)).toHaveCount(2)
    await expectBadge(page, testInfo, 3)
    const before = await settledQuoteId(page)

    await cartItem(page, GOLDEN_OPEN)
      .getByRole('button', { name: `Remover ${GOLDEN_OPEN.nft.name} do carrinho` })
      .click()
    await expect(announcer(page)).toHaveText(`${GOLDEN_OPEN.nft.name} (edição ${GOLDEN_OPEN.edition}) removido do carrinho.`)
    await expect(cartItems(page)).toHaveCount(1)
    // The focus goes to the remaining line (the removed one was the last).
    await expect(removeButton(page, VELVET_OPEN)).toBeFocused()
    await expectBadge(page, testInfo, 1)
    const quote = await expectSummaryMatchesQuote(page)
    expect(quote.quoteId).not.toBe(before)
    expect(quote.subtotalEth).toBe('0.1')

    await cartItem(page, VELVET_OPEN)
      .getByRole('button', { name: `Remover ${VELVET_OPEN.nft.name} do carrinho` })
      .click()
    await expect(page.getByTestId('cart-empty')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeFocused()
    await expect(page.getByTestId('cart-summary')).toHaveCount(0)
    await expectBadge(page, testInfo, 0)
    await page.getByRole('link', { name: 'Explorar NFTs' }).click()
    await expect(page).toHaveURL(/\/#catalogo$/)
  })

  test('KURIO10 is applied by the server and can be removed', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    const initial = await expectSummaryMatchesQuote(page)
    expect(initial.discountEth).toBe('0')

    await applyCoupon(page, 'kurio10')
    await expect(announcer(page)).toHaveText('Cupom KURIO10 aplicado: 10% de desconto.')
    await expect(page.getByTestId('coupon-applied')).toContainText('Cupom KURIO10 aplicado: 10% de desconto.')
    const discounted = await expectSummaryMatchesQuote(page)
    expect(discounted.coupon).toEqual({ code: 'KURIO10', percentOff: 10 })
    expect(discounted).toMatchObject({ subtotalEth: '1.69', discountEth: '0.169', networkFeeEth: '0.016', totalEth: '1.537' })
    await expect(summary(page).getByTestId('quote-total')).toHaveText('1.537 ETH')
    const cartId = await guestCartId(page)
    expect((await serverCarts(page)).guests[cartId!].couponCode).toBe('KURIO10')

    await summary(page).getByRole('button', { name: 'Remover cupom' }).click()
    await expect(announcer(page)).toHaveText('Cupom removido.')
    await expect(couponInput(page)).toBeVisible()
    const removed = await expectSummaryMatchesQuote(page)
    expect(removed).toMatchObject({ discountEth: '0', totalEth: '1.706', coupon: null })
    expect((await serverCarts(page)).guests[cartId!].couponCode).toBeNull()
  })

  test('unknown and expired coupons are refused with accessible messages', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    const before = await expectSummaryMatchesQuote(page)

    await summary(page).getByRole('button', { name: 'Aplicar', exact: true }).click()
    await expect(couponInput(page)).toHaveAccessibleDescription('Digite o código promocional.')

    await applyCoupon(page, 'NAOEXISTE')
    const alert = summary(page).getByRole('alert')
    await expect(alert).toHaveText('O cupom NAOEXISTE não existe.')
    await expect(couponInput(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(couponInput(page)).toHaveAccessibleDescription('O cupom NAOEXISTE não existe.')

    await applyCoupon(page, 'EXPIRED')
    await expect(alert).toHaveText('O cupom EXPIRED expirou.')
    await expect(couponInput(page)).toHaveAccessibleDescription('O cupom EXPIRED expirou.')

    // Nothing was applied: same revision, same values.
    const after = await expectSummaryMatchesQuote(page)
    expect(after).toMatchObject({ cartRevision: before.cartRevision, discountEth: '0', totalEth: before.totalEth })
    const cartId = await guestCartId(page)
    expect((await serverCarts(page)).guests[cartId!].couponCode).toBeNull()

    await couponInput(page).fill('KURIO')
    await expect(alert).toHaveCount(0)
    await expect(couponInput(page)).not.toHaveAttribute('aria-invalid')
  })

  test('the cart, its coupon and the badge survive a refresh', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN, 2)
    await addFromDetail(page, testInfo, GOLDEN_OPEN)
    await applyCoupon(page, 'KURIO10')
    await expect(page.getByTestId('coupon-applied')).toBeVisible()
    const before = await expectSummaryMatchesQuote(page)
    const cartId = await guestCartId(page)

    await page.reload()
    await expect(cartItems(page)).toHaveCount(2)
    await expect(itemQuantity(cartItem(page, VELVET_OPEN))).toHaveText('2')
    await expect(itemQuantity(cartItem(page, GOLDEN_OPEN))).toHaveText('1')
    await expect(page.getByTestId('coupon-applied')).toContainText('KURIO10')
    await expectBadge(page, testInfo, 3)
    const after = await expectSummaryMatchesQuote(page)
    expect(after).toMatchObject({
      cartRevision: before.cartRevision,
      subtotalEth: before.subtotalEth,
      discountEth: before.discountEth,
      totalEth: before.totalEth,
    })
    expect(await guestCartId(page)).toBe(cartId)

    // Another page of the same browser shows the same cart.
    await page.goto('/')
    await expectBadge(page, testInfo, 3)
  })

  test('signing in merges the visitor cart into the account cart without duplicates', async ({ page }, testInfo) => {
    // Two sessions and several pages to build both carts.
    test.slow()
    await login(page, ANA)
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    await expectBadge(page, testInfo, 1)
    expect(await guestCartId(page)).toBeNull()
    await logout(page, testInfo)
    // The account cart is not shown to the visitor.
    await expectBadge(page, testInfo, 0)

    await addFromDetail(page, testInfo, GOLDEN_TEN, 2)
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await expectBadge(page, testInfo, 3)
    const cartId = await guestCartId(page)
    expect(cartId).toMatch(/^gc_/)

    await login(page, ANA, '/login?redirect=%2Fcart')
    await expect(page).toHaveURL(/\/cart$/)
    await expect(cartItems(page)).toHaveCount(2)
    await expect(itemQuantity(cartItem(page, GOLDEN_TEN))).toHaveText('3')
    await expect(itemQuantity(cartItem(page, VELVET_OPEN))).toHaveText('1')
    await expect(page.getByTestId('cart-notices')).toContainText(
      'Os 2 itens do seu carrinho de visitante foram adicionados ao carrinho da sua conta.',
    )
    await expect(announcer(page)).toContainText('Os 2 itens do seu carrinho de visitante foram adicionados')
    await expectBadge(page, testInfo, 4)
    await expectSummaryMatchesQuote(page)

    await expect.poll(() => guestCartId(page)).toBeNull()
    const carts = await serverCarts(page)
    expect(carts.guests).toEqual({})
    expect(carts.users[ANA.id].items).toEqual([
      { editionId: GOLDEN_TEN.editionId, quantity: 3, unitPriceEth: GOLDEN_TEN.price },
      { editionId: VELVET_OPEN.editionId, quantity: 1, unitPriceEth: VELVET_OPEN.price },
    ])

    // Merged once: a refresh does not add the visitor items again.
    await page.reload()
    await expect(itemQuantity(cartItem(page, GOLDEN_TEN))).toHaveText('3')
    await expectBadge(page, testInfo, 4)
    await page.getByTestId('cart-notices').getByRole('button', { name: 'Entendi' }).click()
    await expect(page.getByTestId('cart-notices')).toHaveCount(0)

    // Another account never sees it.
    await logout(page, testInfo)
    await expectBadge(page, testInfo, 0)
    await login(page, BRUNO, '/login?redirect=%2Fcart')
    await expect(page.getByTestId('cart-empty')).toBeVisible()
    await expectBadge(page, testInfo, 0)
    expect((await serverCarts(page)).users[ANA.id].items).toHaveLength(2)
  })

  test('the merge revalidates limits and stock and tells what was adjusted', async ({ page }, testInfo) => {
    // Two sessions and several pages to build both carts.
    test.slow()
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN, 2)
    await addFromDetail(page, testInfo, GOLDEN_TEN, 2)
    await logout(page, testInfo)

    await addFromDetail(page, testInfo, VELVET_OPEN, 2)
    await addFromDetail(page, testInfo, GOLDEN_TEN, 2)
    // Another buyer leaves only 3 of the 1/10 edition before the visitor signs in.
    await setStock(page, GOLDEN_TEN.nft.id, { [GOLDEN_TEN.editionId]: 3 })
    await waitForMockIdle(page)

    await login(page, ANA, '/login?redirect=%2Fcart')
    const notices = page.getByTestId('cart-notices')
    await expect(notices).toContainText('Os 2 itens do seu carrinho de visitante foram adicionados ao carrinho da sua conta.')
    await expect(notices).toContainText(
      `A quantidade de ${VELVET_OPEN.nft.name} (edição ${VELVET_OPEN.edition}) foi ajustada de 4 para 3 ao juntar os carrinhos: o limite é de 3 por pedido.`,
    )
    await expect(notices).toContainText(
      `A quantidade de ${GOLDEN_TEN.nft.name} (edição ${GOLDEN_TEN.edition}) foi ajustada de 4 para 3 ao juntar os carrinhos: só restam 3 disponíveis.`,
    )
    await expect(itemQuantity(cartItem(page, VELVET_OPEN))).toHaveText('3')
    await expect(itemQuantity(cartItem(page, GOLDEN_TEN))).toHaveText('3')
    await expectBadge(page, testInfo, 6)
    const quote = await expectSummaryMatchesQuote(page)
    expect(quote).toMatchObject({ subtotalEth: '5.37', totalEth: '5.386' })
    expect((await serverCarts(page)).guests).toEqual({})
  })

  test('ETH amounts are exact: 0.1 × 3 is 0.3 and 10% of it is 0.03', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN, 3)
    const item = cartItem(page, VELVET_OPEN)
    await expect(itemTotal(item)).toHaveText('0.30 ETH')
    const plain = await expectSummaryMatchesQuote(page)
    expect(plain).toMatchObject({ subtotalEth: '0.3', discountEth: '0', networkFeeEth: '0.016', totalEth: '0.316' })
    expect(plain.lines).toEqual([expect.objectContaining({ unitPriceEth: '0.1', quantity: 3, lineTotalEth: '0.3' })])
    await expect(summary(page).getByTestId('quote-subtotal')).toHaveText('0.30 ETH')

    await applyCoupon(page, 'KURIO10')
    await expect(page.getByTestId('coupon-applied')).toBeVisible()
    const discounted = await expectSummaryMatchesQuote(page)
    expect(discounted).toMatchObject({ subtotalEth: '0.3', discountEth: '0.03', totalEth: '0.286' })
    await expect(summary(page).getByTestId('quote-discount')).toHaveText('(-) 0.03 ETH')
    await expect(summary(page).getByTestId('quote-total')).toHaveText('0.286 ETH')
  })

  test('the totals on screen are the POST /quotes response of the current revision', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN, 3)
    await addFromDetail(page, testInfo, GOLDEN_OPEN, 2)
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    const first = await expectSummaryMatchesQuote(page)
    expect(first).toMatchObject({ itemCount: 6, subtotalEth: '3.97', totalEth: '3.986' })

    // Every change is quoted again for its own revision; the previous quote is not reused.
    await quantityGroup(page, GOLDEN_OPEN)
      .getByRole('button', { name: `Diminuir quantidade de ${GOLDEN_OPEN.nft.name}` })
      .click()
    await expect(itemQuantity(cartItem(page, GOLDEN_OPEN))).toHaveText('1')
    const second = await expectSummaryMatchesQuote(page)
    expect(second.quoteId).not.toBe(first.quoteId)
    expect(second.cartRevision).toBeGreaterThan(first.cartRevision)
    expect(second).toMatchObject({ itemCount: 5, subtotalEth: '2.98', totalEth: '2.996' })

    // A quote for an older revision is refused by the server.
    const stale = await page.evaluate(
      async (revision) => {
        const response = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Cart-Id': window.localStorage.getItem('kurio:guest-cart') ?? '' },
          body: JSON.stringify({ cartRevision: revision }),
        })
        return { status: response.status, body: (await response.json()) as { error: { code: string } } }
      },
      first.cartRevision,
    )
    expect(stale).toEqual({ status: 409, body: expect.objectContaining({ error: expect.objectContaining({ code: 'CART_CHANGED' }) }) })
    expect((await recordedQuote(page, second.quoteId)).totalEth).toBe('2.996')
  })

  test('loading, error and retry for the cart and for the quote', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    await settledQuoteId(page)

    // Slow cart (the scenario survives the reload): a skeleton, then the items.
    await setScenario(page, { latencyMs: 1_500, failure: 'none' })
    await page.reload()
    await expect(page.getByTestId('cart-skeleton')).toBeVisible()
    await expect(cartItem(page, GOLDEN_TEN)).toBeVisible()
    await expect(page.getByTestId('cart-skeleton')).toHaveCount(0)

    // The cart fails: an error, and a retry that works once the server is back.
    await setScenario(page, { latencyMs: 0, failure: 'server-error' })
    await page.reload()
    const cartError = page.getByTestId('cart-error')
    await expect(cartError).toContainText('Não foi possível carregar o carrinho')
    await expect(cartError).toContainText('Erro interno simulado pelo cenário de falha.')
    await expect(cartItems(page)).toHaveCount(0)
    await setScenario(page, { latencyMs: 100, failure: 'none' })
    await cartError.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(cartItem(page, GOLDEN_TEN)).toBeVisible()
    await expect(cartError).toHaveCount(0)
    await setScenario(page, { latencyMs: 0, failure: 'none' })

    // The quote is slow: no value is shown as final while it loads.
    await waitForMockIdle(page)
    await queueNetwork(page, { pathPrefix: '/api/quotes', method: 'POST', delaysMs: [1_500] })
    const group = quantityGroup(page, GOLDEN_TEN)
    await group.getByRole('button', { name: `Aumentar quantidade de ${GOLDEN_TEN.nft.name}` }).click()
    await expect(itemQuantity(cartItem(page, GOLDEN_TEN))).toHaveText('2')
    await expect(summary(page)).toHaveAttribute('aria-busy', 'true')
    await expect(summary(page).getByTestId('quote-total')).not.toHaveText(/ETH/)
    await expect(summary(page).getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled()
    await expectSummaryMatchesQuote(page)
    await expect(summary(page).getByRole('button', { name: 'Conectar e finalizar' })).toBeEnabled()

    // The quote fails: an error with a retry instead of old values.
    await waitForMockIdle(page)
    await queueNetwork(page, { pathPrefix: '/api/quotes', method: 'POST', delaysMs: [0, 0, 0], failure: 'server-error' })
    await group.getByRole('button', { name: `Diminuir quantidade de ${GOLDEN_TEN.nft.name}` }).click()
    const quoteError = summary(page).getByTestId('quote-error')
    await expect(quoteError).toBeVisible({ timeout: 10_000 })
    await expect(summary(page).getByTestId('quote-total')).toHaveCount(0)
    await expect(summary(page).getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled()
    await quoteError.getByRole('button', { name: 'Tentar novamente' }).click()
    const quote = await expectSummaryMatchesQuote(page)
    expect(quote).toMatchObject({ itemCount: 1, totalEth: '1.706' })
  })

  test('the badge and the items stay consistent through a sequence of changes', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await addFromDetail(page, testInfo, GOLDEN_OPEN)
    await addFromDetail(page, testInfo, VELVET_OPEN, 2)
    // Same edition again: one line with the quantities added.
    await expect(cartItems(page)).toHaveCount(2)
    await expect(itemQuantity(cartItem(page, VELVET_OPEN))).toHaveText('3')
    await expectBadge(page, testInfo, 4)

    const golden = quantityGroup(page, GOLDEN_OPEN)
    await golden.getByRole('button', { name: `Aumentar quantidade de ${GOLDEN_OPEN.nft.name}` }).click()
    await expectBadge(page, testInfo, 5)
    await cartItem(page, VELVET_OPEN)
      .getByRole('button', { name: `Remover ${VELVET_OPEN.nft.name} do carrinho` })
      .click()
    await expectBadge(page, testInfo, 2)
    const quote = await expectSummaryMatchesQuote(page)
    expect(quote.itemCount).toBe(2)

    const cartId = await guestCartId(page)
    const server = (await serverCarts(page)).guests[cartId!]
    expect(server.items).toEqual([{ editionId: GOLDEN_OPEN.editionId, quantity: 2, unitPriceEth: GOLDEN_OPEN.price }])
    await page.reload()
    await expectBadge(page, testInfo, 2)
    await expect(cartItems(page)).toHaveCount(1)

    // Mobile: the cart icon of the buy bar adds without leaving the page.
    if (isMobile(testInfo)) {
      await page.goto(`/nfts/${VELVET_OPEN.nft.id}`)
      await page.getByRole('region', { name: 'Compra' }).getByRole('button', { name: 'Adicionar ao carrinho' }).click()
      await expect(announcer(page)).toContainText(`${VELVET_OPEN.nft.name} (edição ${VELVET_OPEN.edition}) adicionado ao carrinho.`)
      await page.goto('/cart')
      await expectBadge(page, testInfo, 3)
    }
  })

  test('a failed refresh keeps the items on screen and stops presenting the total as current', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    const before = await expectSummaryMatchesQuote(page)
    await waitForMockIdle(page)

    // Every attempt of the next read fails (the first one and its two retries).
    await queueNetwork(page, { pathPrefix: '/api/cart', method: 'GET', delaysMs: [0, 0, 0], failure: 'server-error' })
    // Same price, new version: the cart is read again, nothing in it changes.
    await updateNftPrice(page, GOLDEN_TEN.nft.id, '0.99')
    const refreshError = page.getByTestId('cart-refresh-error')
    await expect(refreshError).toContainText('Não foi possível atualizar o carrinho', { timeout: 10_000 })
    await expect(page.getByTestId('cart-error')).toHaveCount(0)
    await expect(cartItems(page)).toHaveCount(1)
    await expect(itemQuantity(cartItem(page, GOLDEN_TEN))).toHaveText('1')
    // The last quote is not shown as the current total, and the user cannot go on.
    await expect(summary(page).getByTestId('quote-unconfirmed')).toBeVisible()
    await expect(summary(page).getByTestId('quote-total')).toHaveCount(0)
    await expect(summary(page).getByRole('button', { name: 'Conectar e finalizar' })).toBeDisabled()

    await refreshError.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(refreshError).toHaveCount(0)
    const after = await expectSummaryMatchesQuote(page)
    expect(after).toMatchObject({ cartRevision: before.cartRevision, totalEth: before.totalEth })
    await expect(summary(page).getByRole('button', { name: 'Conectar e finalizar' })).toBeEnabled()
  })
})

/** Name of the focused element, to prove where the keyboard focus is after each step. */
function focusedName(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return null
    return element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName
  })
}

test.describe('Cart keyboard and focus @cart', () => {
  test('quantity steps with the keyboard keep the focus on the control and change the server cart', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN)
    const cartId = await guestCartId(page)
    const item = cartItem(page, VELVET_OPEN)
    const group = quantityGroup(page, VELVET_OPEN)
    const increase = group.getByRole('button', { name: `Aumentar quantidade de ${VELVET_OPEN.nft.name}` })
    const decrease = group.getByRole('button', { name: `Diminuir quantidade de ${VELVET_OPEN.nft.name}` })
    const serverQuantity = async () => (await serverCarts(page)).guests[cartId!].items[0].quantity

    await increase.focus()
    await page.keyboard.press('Enter')
    await expect(itemQuantity(item)).toHaveText('2')
    await expect(increase).toBeFocused()
    expect(await serverQuantity()).toBe(2)

    await page.keyboard.press('Enter')
    await expect(itemQuantity(item)).toHaveText('3')
    // At the limit the step stays focused, announced as unavailable, with the reason.
    await expect(increase).toBeFocused()
    await expect(increase).toHaveAttribute('aria-disabled', 'true')
    await expect(increase).toHaveAccessibleDescription('Máx. 3')
    expect(await serverQuantity()).toBe(3)
    await waitForMockIdle(page)
    const patches = await requestCount(page, /^PATCH \/api\/cart\/items\//)
    await page.keyboard.press('Enter')
    await expect(increase).toBeFocused()
    await waitForMockIdle(page)
    expect(await requestCount(page, /^PATCH \/api\/cart\/items\//)).toBe(patches)

    await page.keyboard.press('Shift+Tab')
    await expect(decrease).toBeFocused()
    await page.keyboard.press('Space')
    await expect(itemQuantity(item)).toHaveText('2')
    await expect(decrease).toBeFocused()
    await expect(increase).not.toHaveAttribute('aria-disabled')
    expect(await serverQuantity()).toBe(2)
    expect(await focusedName(page)).toBe(`Diminuir quantidade de ${VELVET_OPEN.nft.name}`)
    await expectSummaryMatchesQuote(page)
  })

  test('removing with the keyboard moves the focus to the next line, the previous one, then the empty state', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await addFromDetail(page, testInfo, GOLDEN_OPEN)
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    await expect(cartItems(page)).toHaveCount(3)
    const cartId = await guestCartId(page)
    const serverItems = async () => (await serverCarts(page)).guests[cartId!].items.map((entry) => entry.editionId)

    // Middle line: the focus goes to the next one.
    await removeButton(page, GOLDEN_OPEN).focus()
    await page.keyboard.press('Enter')
    await expect(cartItem(page, GOLDEN_OPEN)).toHaveCount(0)
    await expect(removeButton(page, GOLDEN_TEN)).toBeFocused()
    expect(await serverItems()).toEqual([VELVET_OPEN.editionId, GOLDEN_TEN.editionId])

    // Last line: the focus goes to the previous one.
    await page.keyboard.press('Enter')
    await expect(cartItem(page, GOLDEN_TEN)).toHaveCount(0)
    await expect(removeButton(page, VELVET_OPEN)).toBeFocused()
    expect(await serverItems()).toEqual([VELVET_OPEN.editionId])

    // No line left: the focus goes to the empty state.
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('cart-empty')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeFocused()
    await expect(announcer(page)).toHaveText(`${VELVET_OPEN.nft.name} (edição ${VELVET_OPEN.edition}) removido do carrinho.`)
    expect(await serverItems()).toEqual([])
  })

  test('the coupon is applied and removed with the keyboard and the focus follows', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    const cartId = await guestCartId(page)
    const serverCoupon = async () => (await serverCarts(page)).guests[cartId!].couponCode
    const removeCoupon = summary(page).getByRole('button', { name: 'Remover cupom' })

    // Enter in the field.
    await couponInput(page).focus()
    await page.keyboard.type('kurio10')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('coupon-applied')).toContainText('KURIO10')
    await expect(removeCoupon).toBeFocused()
    expect(await serverCoupon()).toBe('KURIO10')

    await page.keyboard.press('Enter')
    await expect(couponInput(page)).toBeVisible()
    await expect(couponInput(page)).toBeFocused()
    expect(await serverCoupon()).toBeNull()

    // Space on the "Aplicar" button.
    await page.keyboard.type('KURIO10')
    await page.keyboard.press('Tab')
    await expect(summary(page).getByRole('button', { name: 'Aplicar', exact: true })).toBeFocused()
    await page.keyboard.press('Space')
    await expect(removeCoupon).toBeFocused()
    expect(await serverCoupon()).toBe('KURIO10')
    const quote = await expectSummaryMatchesQuote(page)
    expect(quote.coupon).toEqual({ code: 'KURIO10', percentOff: 10 })
  })

  test('repeated activations while a change is pending send it once; the controls work again after the answer', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, GOLDEN_TEN)
    const cartId = await guestCartId(page)
    const item = cartItem(page, GOLDEN_TEN)
    const increase = quantityGroup(page, GOLDEN_TEN).getByRole('button', { name: `Aumentar quantidade de ${GOLDEN_TEN.nft.name}` })
    const checkout = summary(page).getByRole('button', { name: 'Conectar e finalizar' })
    await settledQuoteId(page)
    await waitForMockIdle(page)

    // Quantity: three presses while the first change is on its way.
    const patches = await requestCount(page, /^PATCH \/api\/cart\/items\//)
    await queueNetwork(page, { pathPrefix: '/api/cart/items', method: 'PATCH', delaysMs: [1_500] })
    await increase.focus()
    await page.keyboard.press('Enter')
    await expect(increase).toHaveAttribute('aria-disabled', 'true')
    await expect(item).toHaveAttribute('aria-busy', 'true')
    await expect(checkout).toBeDisabled()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(increase).toBeFocused()
    await expect(itemQuantity(item)).toHaveText('2')
    await waitForMockIdle(page)
    expect(await requestCount(page, /^PATCH \/api\/cart\/items\//)).toBe(patches + 1)
    expect((await serverCarts(page)).guests[cartId!].items[0].quantity).toBe(2)
    // After the answer the control is back to normal and works.
    await expect(increase).not.toHaveAttribute('aria-disabled')
    await expect(item).not.toHaveAttribute('aria-busy')
    await page.keyboard.press('Enter')
    await expect(itemQuantity(item)).toHaveText('3')
    await expect(increase).toBeFocused()
    await expectSummaryMatchesQuote(page)

    // Coupon: Enter pressed three times while the first request is pending.
    await waitForMockIdle(page)
    const puts = await requestCount(page, /^PUT \/api\/cart\/coupon/)
    await queueNetwork(page, { pathPrefix: '/api/cart/coupon', method: 'PUT', delaysMs: [1_500] })
    await couponInput(page).fill('KURIO10')
    await couponInput(page).press('Enter')
    const apply = summary(page).getByRole('button', { name: 'Aplicando…' })
    await expect(apply).toHaveAttribute('aria-disabled', 'true')
    await couponInput(page).press('Enter')
    await couponInput(page).press('Enter')
    await expect(summary(page).getByRole('button', { name: 'Remover cupom' })).toBeFocused()
    await waitForMockIdle(page)
    expect(await requestCount(page, /^PUT \/api\/cart\/coupon/)).toBe(puts + 1)

    // Removal: Enter pressed three times while the first request is pending.
    const deletes = await requestCount(page, /^DELETE \/api\/cart\/items\//)
    await queueNetwork(page, { pathPrefix: '/api/cart/items', method: 'DELETE', delaysMs: [1_500] })
    await removeButton(page, GOLDEN_TEN).focus()
    await page.keyboard.press('Enter')
    await expect(removeButton(page, GOLDEN_TEN)).toHaveAttribute('aria-disabled', 'true')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Seu carrinho está vazio' })).toBeFocused()
    await waitForMockIdle(page)
    expect(await requestCount(page, /^DELETE \/api\/cart\/items\//)).toBe(deletes + 1)
    expect((await serverCarts(page)).guests[cartId!].items).toEqual([])
  })
})

test.describe('Cart and nft.updated @cart @realtime', () => {
  test('a price change with the cart open updates items and quote and warns the user', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, GOLDEN_OPEN, 2)
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    const before = await expectSummaryMatchesQuote(page)
    expect(before.totalEth).toBe('2.096')

    // Every edition moves by the same delta: the open one goes from 0.99 to 1.09.
    const update = await updateNftPrice(page, GOLDEN_OPEN.nft.id, '1.09')
    expect(update.delivered).toBe(1)
    const item = cartItem(page, GOLDEN_OPEN)
    await expect(item.getByTestId('cart-item-unit-price')).toHaveText('1.09 ETH')
    const message = `O preço de ${GOLDEN_OPEN.nft.name} (edição ${GOLDEN_OPEN.edition}) mudou de 0.99 ETH para 1.09 ETH.`
    await expect(page.getByTestId('cart-notices')).toContainText(message)
    await expect(announcer(page)).toContainText(message)
    const after = await expectSummaryMatchesQuote(page)
    expect(after.quoteId).not.toBe(before.quoteId)
    expect(after).toMatchObject({ subtotalEth: '2.28', totalEth: '2.296' })
    await expect(itemTotal(item)).toHaveText('2.18 ETH')

    // An event replayed with the same eventId changes nothing.
    await callMockControl(page, `/__mock/nfts/${GOLDEN_OPEN.nft.id}/replay`, 'POST', { kind: 'duplicate' })
    await expect(page.getByTestId('realtime-events-ignored')).toHaveText('1')
    expect(await settledQuoteId(page)).toBe(after.quoteId)

    await page.reload()
    await expect(item.getByTestId('cart-item-unit-price')).toHaveText('1.09 ETH')
    expect((await expectSummaryMatchesQuote(page)).totalEth).toBe('2.296')
  })

  test('stock running out with the cart open reduces, then removes the item', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN, 3)
    await addFromDetail(page, testInfo, EMERALD_UNIQUE)
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    await expectBadge(page, testInfo, 4)
    await settledQuoteId(page)

    await setStock(page, VELVET_OPEN.nft.id, { [VELVET_OPEN.editionId]: 2 })
    const velvet = cartItem(page, VELVET_OPEN)
    await expect(itemQuantity(velvet)).toHaveText('2')
    const reduced = `A quantidade de ${VELVET_OPEN.nft.name} (edição ${VELVET_OPEN.edition}) foi ajustada de 3 para 2: só restam 2 disponíveis.`
    await expect(page.getByTestId('cart-notices')).toContainText(reduced)
    await expect(velvet.getByTestId('cart-item-limit')).toHaveText('Máx. 2')
    await expectBadge(page, testInfo, 3)
    expect(await expectSummaryMatchesQuote(page)).toMatchObject({ subtotalEth: '2.44' })

    await setStock(page, EMERALD_UNIQUE.nft.id, { [EMERALD_UNIQUE.editionId]: 0 })
    await expect(cartItem(page, EMERALD_UNIQUE)).toHaveCount(0)
    const removed = `${EMERALD_UNIQUE.nft.name} (edição ${EMERALD_UNIQUE.edition}) esgotou e foi removido do carrinho.`
    await expect(page.getByTestId('cart-notices')).toContainText(removed)
    await expect(announcer(page)).toContainText(removed)
    await expectBadge(page, testInfo, 2)
    expect(await expectSummaryMatchesQuote(page)).toMatchObject({ itemCount: 2, subtotalEth: '0.2', totalEth: '0.216' })

    const cartId = await guestCartId(page)
    expect((await serverCarts(page)).guests[cartId!].items).toEqual([
      { editionId: VELVET_OPEN.editionId, quantity: 2, unitPriceEth: VELVET_OPEN.price },
    ])
  })

  test('without the socket the quote is not presented as verified and is checked again before going on', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, GOLDEN_OPEN)
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    const before = await expectSummaryMatchesQuote(page)
    expect(before.totalEth).toBe('1.006')
    await expect(summary(page).getByTestId('quote-unverified')).toHaveCount(0)

    await callMockControl(page, '/__mock/socket/block', 'POST', { blocked: true })
    await expect(page.getByTestId('realtime-state')).toHaveText('desconectado')
    await expect(summary(page).getByTestId('quote-unverified')).toContainText('Sem atualização em tempo real')

    // The seller changes the price; the event cannot reach this page.
    const update = await updateNftPrice(page, GOLDEN_OPEN.nft.id, '1.09')
    expect(update.delivered).toBe(0)
    await expect(summary(page).getByTestId('quote-total')).toHaveText('1.006 ETH')

    // Going on asks the server again: the cart moved, so the user stays and sees it.
    await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(announcer(page)).toContainText('Os valores do carrinho mudaram')
    await expect(cartItem(page, GOLDEN_OPEN).getByTestId('cart-item-unit-price')).toHaveText('1.09 ETH')
    await expect(page.getByTestId('cart-notices')).toContainText(
      `O preço de ${GOLDEN_OPEN.nft.name} (edição ${GOLDEN_OPEN.edition}) mudou de 0.99 ETH para 1.09 ETH.`,
    )
    await expect(page).toHaveURL(/\/cart$/)
    const after = await expectSummaryMatchesQuote(page)
    expect(after).toMatchObject({ subtotalEth: '1.09', totalEth: '1.106' })
    expect(after.cartRevision).toBeGreaterThan(before.cartRevision)

    // Nothing changed since: the check passes and the flow goes on (a visitor signs in first).
    await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout$/)
  })
})