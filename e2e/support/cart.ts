import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { isMobile } from './auth'
import { callMockControl, SESSION_STORAGE_KEY } from './mock-control'

/**
 * Seed editions used by the cart tests (src/mocks/db/seed.ts), duplicated on purpose:
 * tests never import app code. `limit` is min(maxPerOrder, available).
 */
export const VELVET = { id: 'velvet-oracle-240', name: 'Velvet Oracle #240' }
export const VELVET_OPEN = { nft: VELVET, editionId: 'ed_velvet-oracle-240-open', edition: 'Aberta', price: '0.1', limit: 3 }
export const GOLDEN = { id: 'golden-beat-207', name: 'Golden Beat #207' }
export const GOLDEN_OPEN = { nft: GOLDEN, editionId: 'ed_golden-beat-207-open', edition: 'Aberta', price: '0.99', limit: 2 }
export const GOLDEN_TEN = { nft: GOLDEN, editionId: 'ed_golden-beat-207-ten', edition: '1/10', price: '1.69', limit: 5 }
export const EMERALD_NFT = { id: 'emerald-ape-042', name: 'Emerald Ape #042' }
export const EMERALD_UNIQUE = { nft: EMERALD_NFT, editionId: 'ed_emerald-ape-042-unique', edition: '1/1', price: '2.24', limit: 1 }

export type SeedEdition = typeof VELVET_OPEN

export const GUEST_CART_KEY = 'kurio:guest-cart'

/** The app shows ETH with at least two decimals; the API sends canonical strings. */
export function ethDisplay(amount: string): string {
  const [whole, fraction = ''] = amount.split('.')
  return `${whole}.${fraction.padEnd(2, '0')} ETH`
}

/**
 * Adds an edition from its detail page, like a collector: picks the edition, sets the
 * quantity and buys, which opens the cart.
 */
export async function addFromDetail(page: Page, testInfo: TestInfo, entry: SeedEdition, quantity = 1) {
  await page.goto(`/nfts/${entry.nft.id}`)
  await expect(page.getByRole('heading', { level: 1, name: entry.nft.name })).toBeVisible()
  const editions = page.getByRole('radiogroup', { name: 'Edição:' })
  const name = new RegExp(`^${entry.edition.replace('/', '\\/')}\\W`)
  await editions.locator('label').filter({ hasText: name }).click()
  await expect(editions.getByRole('radio', { name })).toBeChecked()
  const stepper = page.getByRole('group', { name: 'Quantidade' }).filter({ visible: true })
  for (let index = 1; index < quantity; index += 1) {
    await stepper.getByRole('button', { name: 'Aumentar quantidade' }).click()
  }
  await expect(stepper.getByRole('status', { name: 'Quantidade selecionada' })).toHaveText(String(quantity))
  const buy = isMobile(testInfo)
    ? page.getByRole('region', { name: 'Compra' }).getByRole('button', { name: 'Comprar NFT' })
    : page.getByRole('button', { name: 'COMPRAR' })
  await buy.click()
  await expect(page).toHaveURL(/\/cart$/)
  await expect(cartItem(page, entry)).toBeVisible()
}

export function cartItems(page: Page): Locator {
  return page.getByRole('list', { name: 'Itens do carrinho' }).getByTestId('cart-item')
}

/** The line of one edition (an NFT can be in the cart with several editions). */
export function cartItem(page: Page, entry: SeedEdition): Locator {
  return cartItems(page).and(page.locator(`[data-item-id="${entry.editionId}"]`))
}

export function itemQuantity(item: Locator): Locator {
  return item.getByTestId('cart-item-quantity')
}

/** Line total of the current layout (the mobile card and the desktop column each have one). */
export function itemTotal(item: Locator): Locator {
  return item.getByTestId('cart-item-total').filter({ visible: true })
}

export function summary(page: Page): Locator {
  return page.getByTestId('cart-summary')
}

/** Waits until the summary shows a settled quote of the cart on screen and returns its id. */
export async function settledQuoteId(page: Page): Promise<string> {
  const panel = summary(page)
  await expect(panel).not.toHaveAttribute('aria-busy', 'true')
  await expect(panel.getByTestId('quote-total')).toHaveText(/ETH$/)
  const quoteId = await panel.getAttribute('data-quote-id')
  expect(quoteId).toMatch(/^qt_/)
  return quoteId!
}

export interface ApiQuote {
  quoteId: string
  cartRevision: number
  itemCount: number
  subtotalEth: string
  discountEth: string
  networkFeeEth: string
  totalEth: string
  coupon: { code: string; percentOff: number } | null
  lines: { itemId: string; quantity: number; unitPriceEth: string; lineTotalEth: string }[]
}

/** The quote exactly as POST /api/quotes answered it (recorded by the mock). */
export function recordedQuote(page: Page, quoteId: string): Promise<ApiQuote> {
  return callMockControl<ApiQuote>(page, `/__mock/quotes/${quoteId}`)
}

/**
 * The summary on screen is the response of POST /quotes, value by value, and belongs
 * to the revision of the cart on screen. Returns that response.
 */
export async function expectSummaryMatchesQuote(page: Page): Promise<ApiQuote> {
  const quoteId = await settledQuoteId(page)
  const quote = await recordedQuote(page, quoteId)
  const panel = summary(page)
  await expect(panel).toHaveAttribute('data-cart-revision', String(quote.cartRevision))
  await expect(panel.getByTestId('quote-subtotal')).toHaveText(ethDisplay(quote.subtotalEth))
  await expect(panel.getByTestId('quote-discount')).toHaveText(`(-) ${ethDisplay(quote.discountEth)}`)
  await expect(panel.getByTestId('quote-fee')).toHaveText(ethDisplay(quote.networkFeeEth))
  await expect(panel.getByTestId('quote-total')).toHaveText(ethDisplay(quote.totalEth))
  for (const line of quote.lines) {
    const item = cartItems(page).and(page.locator(`[data-item-id="${line.itemId}"]`))
    await expect(itemQuantity(item)).toHaveText(String(line.quantity))
    await expect(itemTotal(item)).toHaveText(ethDisplay(line.lineTotalEth))
  }
  await expect(cartItems(page)).toHaveCount(quote.lines.length)
  return quote
}

/** Badge of the current layout (header on desktop, tab bar on mobile) and its link. */
export function cartLink(page: Page, testInfo: TestInfo): Locator {
  const nav = isMobile(testInfo)
    ? page.getByRole('navigation', { name: 'Atalhos' })
    : page.getByRole('navigation', { name: 'Principal' })
  return nav.getByRole('link', { name: /^Carrinho/ })
}

/**
 * In-app navigation to the cart. Mobile detail/account screens hide the tab bar
 * (Voltar / Início restore browsing chrome — same pattern as ensureCatalogReady).
 */
export async function openCartInApp(page: Page, testInfo: TestInfo) {
  if (!(await cartLink(page, testInfo).isVisible())) {
    if (isMobile(testInfo)) {
      const back = page.getByRole('button', { name: 'Voltar' })
      if (await back.isVisible()) {
        await back.click()
      }
      if (!(await cartLink(page, testInfo).isVisible())) {
        const homeTab = page.getByRole('navigation', { name: 'Atalhos' }).getByRole('link', { name: 'Início' })
        if (await homeTab.isVisible()) {
          await homeTab.click()
        } else {
          await page.goto('/')
        }
      }
    } else {
      await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'KURIO' }).click()
    }
  }
  await cartLink(page, testInfo).click()
  await expect(page).toHaveURL(/\/cart$/)
}

/**
 * userId from `kurio:session` (`{ token, userId }`). Missing / invalid session → guest cart.
 */
function sessionUserId(raw: string | null): string | null {
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as { userId?: unknown }
    return typeof session.userId === 'string' && session.userId ? session.userId : null
  } catch {
    return null
  }
}

/** Total quantity in the active cart (guest or signed-in), via the mock control API. */
async function serverCartQuantity(page: Page): Promise<number> {
  const carts = await serverCarts(page)
  const sessionRaw = await page.evaluate((key) => window.localStorage.getItem(key), SESSION_STORAGE_KEY)
  const userId = sessionUserId(sessionRaw)
  if (userId) {
    const userCart = carts.users[userId]
    return userCart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  }
  const cartId = await guestCartId(page)
  if (!cartId || !carts.guests[cartId]) return 0
  return carts.guests[cartId].items.reduce((sum, item) => sum + item.quantity, 0)
}

/** Mobile routes that omit the tab bar (Figma screens with "Voltar"). */
function mobileTabBarHidden(pathname: string): boolean {
  return (
    pathname === '/cart' ||
    pathname.startsWith('/nfts/') ||
    pathname.startsWith('/account/') ||
    pathname.startsWith('/checkout') ||
    pathname === '/login' ||
    pathname === '/signup'
  )
}

export async function expectBadge(page: Page, testInfo: TestInfo, count: number) {
  const link = cartLink(page, testInfo)
  // On those screens the badge is not in the DOM; the mock control is the source of truth.
  // Prefer the path over a one-shot isVisible() so a slow tab-bar mount on home is not
  // mistaken for a hidden bar (and so we poll until the server cart catches up).
  if (isMobile(testInfo) && mobileTabBarHidden(new URL(page.url()).pathname)) {
    // After a reload the service worker may briefly serve HTML for /__mock/*; wait until
    // the demo panel can read mock state, then poll quantity (PATCH may still be in flight).
    await expect(page.getByTestId('storage-state')).toContainText('ok')
    await expect
      .poll(async () => {
        try {
          return await serverCartQuantity(page)
        } catch {
          return Number.NaN
        }
      })
      .toBe(count)
    return
  }
  if (count === 0) {
    await expect(link).toHaveAccessibleName('Carrinho')
    await expect(link.getByTestId('cart-badge')).toHaveCount(0)
    return
  }
  await expect(link).toHaveAccessibleName(`Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`)
  await expect(link.getByTestId('cart-badge')).toHaveText(String(count))
}

export interface CartSummaryState {
  revision: number
  couponCode: string | null
  items: { editionId: string; quantity: number; unitPriceEth: string }[]
  notices: string[]
}

export function serverCarts(page: Page) {
  return callMockControl<{
    users: Record<string, CartSummaryState>
    guests: Record<string, CartSummaryState>
    /** Visitor cart ids already merged into an account (late visitor writes are refused). */
    mergedGuests: string[]
  }>(
    page,
    '/__mock/carts',
  )
}

export function guestCartId(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), GUEST_CART_KEY)
}

/** Stock change made on the server (as by another buyer); emits `nft.updated`. */
export function setStock(page: Page, nftId: string, available: Record<string, number>) {
  return callMockControl<{ eventId: string; version: number; delivered: number }>(
    page,
    `/__mock/nfts/${nftId}/update`,
    'POST',
    { available },
  )
}

export function couponInput(page: Page): Locator {
  return summary(page).getByRole('textbox', { name: 'Código promocional' })
}

export async function applyCoupon(page: Page, code: string) {
  await couponInput(page).fill(code)
  await summary(page).getByRole('button', { name: 'Aplicar', exact: true }).click()
}
