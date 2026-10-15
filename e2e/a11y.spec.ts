import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { ANA, BRUNO, isMobile, login } from './support/auth'
import { addFromDetail, summary, VELVET_OPEN } from './support/cart'
import { CATALOG_TOTAL, EMERALD, expectCatalogCount } from './support/catalog'

const PAGES = [
  { path: '/', ready: (page: Page) => expectCatalogCount(page, CATALOG_TOTAL) },
  {
    path: `/nfts/${EMERALD.id}`,
    ready: async (page: Page) => {
      await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
      await expect(page.getByTestId('recommendations-carousel').getByTestId('nft-card').first()).toBeVisible()
    },
  },
  { path: '/nfts/nao-existe-999', ready: (page: Page) => expect(page.getByRole('heading', { level: 1, name: 'NFT não encontrado' })).toBeVisible() },
]

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
    })),
  ).toEqual([])
}

test.describe('accessibility @a11y', () => {
  for (const target of PAGES) {
    test(`axe finds no WCAG A/AA violations on ${target.path}`, async ({ page }) => {
      await page.goto(target.path)
      await target.ready(page)
      await expectNoAxeViolations(page)
    })
  }

  test('axe covers the authenticated favorites list and mobile filter drawer', async ({ page }, testInfo) => {
    await login(page, BRUNO)
    await page.goto('/account/favorites')
    await expect(page.getByRole('list', { name: 'NFTs salvos' })).toBeVisible()
    await expectNoAxeViolations(page)

    if (isMobile(testInfo)) {
      await page.goto('/')
      await expectCatalogCount(page, CATALOG_TOTAL)
      await page.getByRole('button', { name: /^Filtros/ }).click()
      await expect(page.getByRole('dialog', { name: 'Filtros' })).toBeVisible()
      await expectNoAxeViolations(page)
    }
  })

  test('keyboard navigation preserves focus through the filter drawer', async ({ page }, testInfo) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main#conteudo')).toBeFocused()

    const cardLink = page.getByRole('list', { name: 'NFTs', exact: true }).getByRole('link').first()
    await cardLink.focus()
    expect(await cardLink.evaluate((element) => getComputedStyle(element, '::after').boxShadow)).not.toBe('none')

    if (isMobile(testInfo)) {
      await page.goto('/')
      const trigger = page.getByRole('button', { name: /^Filtros/ })
      await trigger.focus()
      await page.keyboard.press('Enter')
      const drawer = page.getByRole('dialog', { name: 'Filtros' })
      await expect(drawer).toBeVisible()
      for (let step = 0; step < 25; step += 1) {
        await page.keyboard.press('Tab')
        expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      }
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      await expect(trigger).toBeFocused()
    }
  })

  test('checkout errors are described by their fields and receive focus', async ({ page }, testInfo) => {
    await login(page, ANA)
    await addFromDetail(page, testInfo, VELVET_OPEN)
    await summary(page).getByRole('button', { name: 'Conectar e finalizar' }).click()
    const name = page.getByLabel('Nome completo')
    const email = page.getByLabel('E-mail')
    await name.fill(' ')
    await email.fill('invalido')
    await page.getByRole('button', { name: 'Confirmar compra' }).click()

    await expect(name).toBeFocused()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toHaveAccessibleDescription('Informe seu nome completo.')
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAccessibleDescription(/e-mail/i)
  })

  test('reduced motion disables decorative animation and smooth scrolling', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/nfts/${EMERALD.id}`)
    await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
    const styles = await page.getByTestId('recommendations-carousel').getByRole('list').evaluate((element) => ({
      scroll: getComputedStyle(element).scrollBehavior,
      transition: getComputedStyle(element.querySelector('img')!).transitionDuration,
    }))
    expect(styles.scroll).toBe('auto')
    expect(parseFloat(styles.transition)).toBeLessThan(0.01)
  })
})
