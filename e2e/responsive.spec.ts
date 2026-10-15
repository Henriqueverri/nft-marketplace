import { expect, test, type Page } from '@playwright/test'
import { ANA, isMobile, login } from './support/auth'
import { addFromDetail, summary, VELVET_OPEN } from './support/cart'
import { CATALOG_TOTAL, EMERALD, expectCatalogCount } from './support/catalog'

const WIDTHS = { mobile: [320, 390], desktop: [768, 1440] }

async function expectNoHorizontalOverflow(page: Page, label: string) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: label })
    .toBe(0)
}

test.describe('responsive layouts @responsive', () => {
  test('public screens and the 404 route have no horizontal overflow at every supported width', async ({ page }, testInfo) => {
    const pages = [
      { path: '/', ready: () => expectCatalogCount(page, CATALOG_TOTAL) },
      { path: `/nfts/${EMERALD.id}`, ready: () => expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible() },
      { path: '/nfts/nao-existe-999', ready: () => expect(page.getByRole('heading', { level: 1, name: 'NFT não encontrado' })).toBeVisible() },
      { path: '/rota-inexistente', ready: () => expect(page.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible() },
      { path: '/login', ready: () => expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible() },
      { path: '/signup', ready: () => expect(page.getByLabel('E-mail')).toBeVisible() },
    ]
    for (const width of WIDTHS[isMobile(testInfo) ? 'mobile' : 'desktop']) {
      await page.setViewportSize({ width, height: 900 })
      for (const target of pages) {
        await page.goto(target.path)
        await target.ready()
        await expectNoHorizontalOverflow(page, `${target.path} at ${width}px`)
      }
    }
  })

  test('account, cart and checkout retain content without overflow', async ({ page }, testInfo) => {
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento' })).toBeVisible()

    const pages = [
      { path: '/account/profile', heading: 'Perfil do colecionador' },
      { path: '/account/wallets', heading: 'Carteiras' },
      { path: '/account/orders', heading: 'Histórico de pedidos' },
      { path: '/cart', heading: 'Carrinho de NFTs' },
      { path: '/checkout', heading: 'Pagamento' },
    ]
    for (const width of WIDTHS[isMobile(testInfo) ? 'mobile' : 'desktop']) {
      await page.setViewportSize({ width, height: 900 })
      for (const target of pages) {
        await page.goto(target.path)
        await expect(page.getByRole('heading', { level: 1, name: target.heading })).toBeVisible()
        await expectNoHorizontalOverflow(page, `${target.path} at ${width}px`)
      }
    }
  })

  test('the tablet catalog is a two-column grid with filters in a drawer and checkout stays one column', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 })
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    const cards = page.getByRole('list', { name: 'NFTs' }).locator(':scope > li')
    expect(await cards.nth(2).evaluate((element) => (element as HTMLElement).offsetTop)).toBeGreaterThan(
      await cards.first().evaluate((element) => (element as HTMLElement).offsetTop),
    )
    await page.getByRole('button', { name: /^Filtros/ }).click()
    await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible()

    await login(page, ANA)
    await page.goto(`/nfts/${VELVET_OPEN.nft.id}`)
    await page.getByRole('button', { name: 'COMPRAR' }).click()
    await expect(page).toHaveURL(/\/cart$/)
    await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page.getByRole('form', { name: 'Pagamento' })).toHaveCSS('flex-direction', 'column')
  })
})
