import { expect, test, type Page } from '@playwright/test'
import { ANA, login } from './support/auth'
import { addFromDetail, summary, VELVET_OPEN } from './support/cart'
import { CATALOG_TOTAL, EMERALD, expectCatalogCount } from './support/catalog'

// `connectionId` and local-storage byte count belong to the diagnostic panel and
// vary by socket/session. Hide only their values while capturing; the panel
// remains in the application and all other diagnostic state stays covered.
const dynamicDiagnosticStyle =
  '[data-testid="realtime-last-hello"], [data-testid="storage-state"] { display: none; }'

async function expectVisualSnapshot(page: Page, name: string) {
  await page.addStyleTag({ content: dynamicDiagnosticStyle })
  await expect(page).toHaveScreenshot(name, { animations: 'disabled', fullPage: true })
}

test.describe('visual baselines @visual', () => {
  test('home', async ({ page }) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    await expectVisualSnapshot(page, 'home.png')
  })

  test('NFT detail', async ({ page }) => {
    await page.goto(`/nfts/${EMERALD.id}`)
    await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
    await expect.poll(() => page.getByTestId('related-carousel').locator('li').count()).toBeGreaterThan(0)
    await expect.poll(() => page.getByTestId('recommendations-carousel').locator('li').count()).toBeGreaterThan(0)
    await expectVisualSnapshot(page, 'nft-detail.png')
  })

  test('cart', async ({ page }, testInfo) => {
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await expect.poll(() => page.getByTestId('recommendations-carousel').locator('li').count()).toBeGreaterThan(0)
    await expectVisualSnapshot(page, 'cart.png')
  })

  test('checkout', async ({ page }, testInfo) => {
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento' })).toBeVisible()
    await expect(page.getByTestId('checkout-review')).not.toHaveAttribute('aria-busy', 'true')
    await expectVisualSnapshot(page, 'checkout.png')
  })
})
