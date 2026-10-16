import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { ANA, BRUNO, fillLogin, login, logout, openLogin } from './support/auth'
import {
  addFromDetail,
  cartItem,
  cartItems,
  cartLink,
  expectBadge,
  expectSummaryMatchesQuote,
  GOLDEN_OPEN,
  guestCartId,
  itemQuantity,
  serverCarts,
  settledQuoteId,
  VELVET_OPEN,
  type SeedEdition,
} from './support/cart'
import { announcer, queueNetwork, requestCount, updateNftPrice, waitForMockIdle } from './support/catalog'

/**
 * Races between cart reads, cart changes, the sign-in merge and quotes. Each one is
 * ordered with the mock's one-shot delays (`phase: 'response'` holds an answer the
 * server already produced), never with fixed waits. Sign-ins happen inside the app
 * (no reload), because a reload would drop the requests the mock is still holding.
 */

async function signInInApp(page: Page, account: typeof ANA) {
  await openLogin(page)
  await fillLogin(page, account.email, account.password)
  await expect(page.getByTestId('session-user')).toHaveText(`@${account.username}`)
}

/** On the detail page of `entry`, with its edition picked, ready to buy. */
async function openDetail(page: Page, entry: SeedEdition) {
  await page.goto(`/nfts/${entry.nft.id}`)
  await expect(page.getByRole('heading', { level: 1, name: entry.nft.name })).toBeVisible()
  const editions = page.getByRole('radiogroup', { name: 'Edição:' })
  const name = new RegExp(`^${entry.edition.replace('/', '\\/')}\\W`)
  await editions.locator('label').filter({ hasText: name }).click()
  await expect(editions.getByRole('radio', { name })).toBeChecked()
  await waitForMockIdle(page)
}

/** In-app navigation to the cart (the mobile detail page has no tab bar: through the home). */
async function openCartInApp(page: Page, testInfo: TestInfo) {
  if (!(await cartLink(page, testInfo).isVisible())) {
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'KURIO' }).click()
  }
  await cartLink(page, testInfo).click()
  await expect(page).toHaveURL(/\/cart$/)
}

function buyButton(page: Page) {
  return page.getByRole('button', { name: /^(COMPRAR|Comprar NFT)$/ }).filter({ visible: true })
}

/** A session token of `account` obtained straight from the API (the page's session is untouched). */
async function apiToken(page: Page, account: typeof ANA): Promise<string> {
  return page.evaluate(async ({ email, password }) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    return ((await response.json()) as { token: string }).token
  }, account)
}

interface ApiResult {
  status: number
  body: {
    revision?: number
    items?: { id: string; quantity: number }[]
    notices?: { kind: string }[]
    lines?: unknown[]
    totalEth?: string
    error?: { code: string }
  }
}

/** A cart API call made from the page, outside the app (its own headers only). */
function apiCall(page: Page, method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<ApiResult> {
  return page.evaluate(
    async ({ method, path, headers, body }) => {
      const response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: response.status, body: await response.json() }
    },
    { method, path, headers, body },
  )
}

test.describe('Cart concurrency @cart', () => {
  test('a change racing a read of the cart is kept, whether the read is cancelled or answers late', async ({ page }, testInfo) => {
    // Two sessions and several pages.
    test.slow()
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await logout(page)
    await openDetail(page, GOLDEN_OPEN)
    const reads = () => requestCount(page, /^GET \/api\/cart$/)
    const readsBefore = await reads()

    // The first read of the account cart after the sign-in is answered late (with the
    // cart as it was); the user buys meanwhile and the change cancels that read.
    await queueNetwork(page, { pathPrefix: '/api/cart', method: 'GET', delaysMs: [4_000], phase: 'response' })
    await signInInApp(page, ANA)
    await expect(page).toHaveURL(/\/nfts\/golden-beat-207/)
    await buyButton(page).click()
    await expect(page).toHaveURL(/\/cart$/)
    await expect(cartItems(page)).toHaveCount(2)
    await waitForMockIdle(page)
    expect(await reads()).toBeGreaterThan(readsBefore)
    await expect(cartItems(page)).toHaveCount(2)
    await expectBadge(page, testInfo, 2)

    // A read that starts after the change but carries the state from before it (a
    // slow network) is not cancelled: the cache keeps the newer revision.
    const readsBeforeLate = await reads()
    await queueNetwork(page, { pathPrefix: '/api/cart/items', method: 'PATCH', delaysMs: [1_500] })
    await queueNetwork(page, { pathPrefix: '/api/cart', method: 'GET', delaysMs: [3_000], phase: 'response' })
    await cartItem(page, GOLDEN_OPEN)
      .getByRole('button', { name: `Aumentar quantidade de ${GOLDEN_OPEN.nft.name}` })
      .click()
    await updateNftPrice(page, VELVET_OPEN.nft.id, VELVET_OPEN.price)
    await expect(itemQuantity(cartItem(page, GOLDEN_OPEN))).toHaveText('2')
    await waitForMockIdle(page)
    expect(await reads()).toBeGreaterThan(readsBeforeLate)
    await expect(itemQuantity(cartItem(page, GOLDEN_OPEN))).toHaveText('2')
    await expectBadge(page, testInfo, 3)
    await expectSummaryMatchesQuote(page)
    expect((await serverCarts(page)).users[ANA.id].items.map((entry) => entry.quantity)).toEqual([1, 2])
  })

  test('a visitor addition still on its way when the visitor signs in is merged, not lost or orphaned', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN)
    const cartId = await guestCartId(page)
    await openDetail(page, GOLDEN_OPEN)

    // The addition reaches the server only after the sign-in has started.
    await queueNetwork(page, { pathPrefix: '/api/cart/items', method: 'POST', delaysMs: [6_000] })
    await buyButton(page).click()
    await signInInApp(page, ANA)
    expect(await requestCount(page, /^POST \/api\/cart\/items$/)).toBe(0)
    expect(await requestCount(page, /^POST \/api\/cart\/merge$/)).toBe(0)

    await waitForMockIdle(page)
    expect(await requestCount(page, /^POST \/api\/cart\/items$/)).toBe(1)
    expect(await requestCount(page, /^POST \/api\/cart\/merge$/)).toBe(1)
    await openCartInApp(page, testInfo)
    await expect(cartItems(page)).toHaveCount(2)
    await expect(page.getByTestId('cart-notices')).toContainText(
      'Os 2 itens do seu carrinho de visitante foram adicionados ao carrinho da sua conta.',
    )
    await expectBadge(page, testInfo, 2)
    await expectSummaryMatchesQuote(page)

    const carts = await serverCarts(page)
    expect(carts.guests).toEqual({})
    expect(carts.mergedGuests).toContain(cartId)
    expect(carts.users[ANA.id].items.map((entry) => entry.editionId)).toEqual([VELVET_OPEN.editionId, GOLDEN_OPEN.editionId])
    expect(await guestCartId(page)).toBeNull()
  })

  test('the merge finishes on the server while the cart read waiting for it is cancelled', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN, 2)
    // The default edition: the detail page starts over when the session changes.
    await openDetail(page, GOLDEN_OPEN)

    // The merge is slow; the user buys as soon as the session starts, which cancels
    // the read of the account cart that is waiting for the merge.
    await queueNetwork(page, { pathPrefix: '/api/cart/merge', method: 'POST', delaysMs: [5_000] })
    await signInInApp(page, ANA)
    expect(await requestCount(page, /^POST \/api\/cart\/merge$/)).toBe(0)
    await buyButton(page).click()
    // The addition waits for the merge (held for 5 s) before it is sent.
    await expect(page).toHaveURL(/\/cart$/, { timeout: 10_000 })

    // The change waited for the merge: the visitor's items are on screen with it,
    // without a reload, and the merge ran once.
    await expect(cartItems(page)).toHaveCount(2)
    await expect(itemQuantity(cartItem(page, VELVET_OPEN))).toHaveText('2')
    await expect(itemQuantity(cartItem(page, GOLDEN_OPEN))).toHaveText('1')
    await expectBadge(page, testInfo, 3)
    await waitForMockIdle(page)
    expect(await requestCount(page, /^POST \/api\/cart\/merge$/)).toBe(1)
    await expect(cartItems(page)).toHaveCount(2)
    await expectSummaryMatchesQuote(page)
    expect(await guestCartId(page)).toBeNull()
    const carts = await serverCarts(page)
    expect(carts.guests).toEqual({})
    expect(carts.users[ANA.id].items).toEqual([
      { editionId: VELVET_OPEN.editionId, quantity: 2, unitPriceEth: VELVET_OPEN.price },
      { editionId: GOLDEN_OPEN.editionId, quantity: 1, unitPriceEth: GOLDEN_OPEN.price },
    ])
  })

  test('POST /merge is idempotent and a visitor write arriving after it is refused', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN, 2)
    const cartId = (await guestCartId(page))!
    const token = await apiToken(page, ANA)
    const asAna = { Authorization: `Bearer ${token}`, 'X-Cart-Id': cartId }
    await waitForMockIdle(page)

    // A visitor addition sent before the merge reaches the handler after it.
    await queueNetwork(page, { pathPrefix: '/api/cart/items', method: 'POST', delaysMs: [1_500] })
    const lateWrite = apiCall(page, 'POST', '/api/cart/items', { 'X-Cart-Id': cartId }, {
      nftId: GOLDEN_OPEN.nft.id,
      editionId: GOLDEN_OPEN.editionId,
      quantity: 1,
    })

    const first = await apiCall(page, 'POST', '/api/cart/merge', asAna)
    expect(first.status).toBe(200)
    expect(first.body.items).toEqual([expect.objectContaining({ id: VELVET_OPEN.editionId, quantity: 2 })])
    expect(first.body.notices?.filter((entry) => entry.kind === 'merged')).toHaveLength(1)

    const second = await apiCall(page, 'POST', '/api/cart/merge', asAna)
    expect(second.status).toBe(200)
    expect(second.body.revision).toBe(first.body.revision)
    expect(second.body.items).toEqual(first.body.items)
    expect(second.body.notices).toEqual(first.body.notices)

    const late = await lateWrite
    expect(late.status).toBe(409)
    expect(late.body.error?.code).toBe('CART_MERGED')

    const carts = await serverCarts(page)
    expect(carts.guests).toEqual({})
    expect(carts.mergedGuests).toContain(cartId)
    expect(carts.users[ANA.id].items).toEqual([{ editionId: VELVET_OPEN.editionId, quantity: 2, unitPriceEth: VELVET_OPEN.price }])
  })

  test('a quote racing the merge answers 409 CART_CHANGED, never an error or a quote of another cart', async ({ page }, testInfo) => {
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await settledQuoteId(page)
    const cartId = (await guestCartId(page))!
    const revision = Number(await page.getByTestId('cart-summary').getAttribute('data-cart-revision'))
    expect(revision).toBeGreaterThan(0)
    const token = await apiToken(page, ANA)
    await waitForMockIdle(page)

    // The quote of the visitor cart is handled after the merge deleted that cart.
    await queueNetwork(page, { pathPrefix: '/api/quotes', method: 'POST', delaysMs: [1_500] })
    const quote = apiCall(page, 'POST', '/api/quotes', { 'X-Cart-Id': cartId }, { cartRevision: revision })
    const merged = await apiCall(page, 'POST', '/api/cart/merge', { Authorization: `Bearer ${token}`, 'X-Cart-Id': cartId })
    expect(merged.status).toBe(200)

    const answer = await quote
    expect(answer.status).toBe(409)
    expect(answer.body.error?.code).toBe('CART_CHANGED')
    // The cart no longer exists: only the empty revision 0 can be quoted.
    const empty = await apiCall(page, 'POST', '/api/quotes', { 'X-Cart-Id': cartId }, { cartRevision: 0 })
    expect(empty.status).toBe(200)
    expect(empty.body).toMatchObject({ lines: [], totalEth: '0' })
  })

  test('after a user switch, late cart answers of the previous account change nothing', async ({ page }, testInfo) => {
    // Two sessions and several pages.
    test.slow()
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await settledQuoteId(page)
    await waitForMockIdle(page)

    // Ana's quantity change and a read of her cart (answered with her data, held by
    // the network) are both on their way when she leaves and Bruno signs in.
    await queueNetwork(page, { pathPrefix: '/api/cart/items', method: 'PATCH', delaysMs: [6_000] })
    await queueNetwork(page, { pathPrefix: '/api/cart', method: 'GET', delaysMs: [6_000], phase: 'response' })
    await cartItem(page, VELVET_OPEN)
      .getByRole('button', { name: `Aumentar quantidade de ${VELVET_OPEN.nft.name}` })
      .click()
    await updateNftPrice(page, VELVET_OPEN.nft.id, VELVET_OPEN.price)
    await logout(page)
    await signInInApp(page, BRUNO)
    await openCartInApp(page, testInfo)
    await expect(page.getByTestId('cart-empty')).toBeVisible()

    await waitForMockIdle(page)
    expect(await requestCount(page, /^PATCH \/api\/cart\/items\//)).toBe(1)
    await expect(page.getByTestId('session-user')).toHaveText(`@${BRUNO.username}`)
    await expect(page.getByTestId('cart-empty')).toBeVisible()
    await expect(cartItems(page)).toHaveCount(0)
    await expectBadge(page, testInfo, 0)
    await expect(announcer(page)).not.toContainText('Não foi possível')
    // Ana's change was refused (her session ended at logout); her cart is as she left it.
    const carts = await serverCarts(page)
    expect(carts.users[ANA.id].items).toEqual([{ editionId: VELVET_OPEN.editionId, quantity: 1, unitPriceEth: VELVET_OPEN.price }])
    expect(carts.users[BRUNO.id]).toBeUndefined()
  })
})
