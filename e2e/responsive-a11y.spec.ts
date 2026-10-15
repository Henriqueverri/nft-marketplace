import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { BRUNO, isMobile, login } from './support/auth'
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

/** Widths per project: phones on the mobile project, tablet and desktop on the other. */
const WIDTHS = { mobile: [320, 390, 414], desktop: [768, 1440] }

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.slice(0, 3).map((node) => node.target.join(' ')),
  }))
  expect(summary).toEqual([])
}

test.describe('responsive and accessibility @a11y', () => {
  test('no horizontal overflow on the supported widths', async ({ page }, testInfo) => {
    const widths = isMobile(testInfo) ? WIDTHS.mobile : WIDTHS.desktop
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      for (const target of PAGES) {
        await page.goto(target.path)
        await target.ready(page)
        expect(await horizontalOverflow(page), `${target.path} at ${width}px`).toBe(0)
      }
    }
    await login(page, BRUNO)
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/account/favorites')
      await expect(page.getByRole('list', { name: 'NFTs salvos' })).toBeVisible()
      expect(await horizontalOverflow(page), `/account/favorites at ${width}px`).toBe(0)
    }
  })

  for (const target of PAGES) {
    test(`axe finds no WCAG A/AA violations on ${target.path}`, async ({ page }) => {
      await page.goto(target.path)
      await target.ready(page)
      await expectNoAxeViolations(page)
    })
  }

  test('axe finds no WCAG A/AA violations on the favorites list and the filter drawer', async ({ page }, testInfo) => {
    await login(page, BRUNO)
    await page.goto('/account/favorites')
    await expect(page.getByRole('list', { name: 'NFTs salvos' })).toBeVisible()
    await expectNoAxeViolations(page)

    if (isMobile(testInfo)) {
      await page.goto('/')
      await expectCatalogCount(page, CATALOG_TOTAL)
      await page.getByRole('button', { name: /^Filtros/ }).click()
      await expect(page.getByRole('dialog', { name: 'Filtros' }).getByRole('checkbox').first()).toBeAttached()
      await expectNoAxeViolations(page)
    }
  })

  test('keyboard: skip link, visible focus and the filter drawer focus trap', async ({ page }, testInfo) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.locator('main#conteudo')).toBeFocused()

    // Focus on a card link is drawn (ring on the stretched link area).
    const cardLink = page.getByRole('list', { name: 'NFTs', exact: true }).getByRole('link').first()
    await cardLink.focus()
    const ring = await cardLink.evaluate((element) => getComputedStyle(element, '::after').boxShadow)
    expect(ring).not.toBe('none')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/nfts\//)

    if (isMobile(testInfo)) {
      await page.goto('/')
      const trigger = page.getByRole('button', { name: /^Filtros/ })
      await trigger.focus()
      await page.keyboard.press('Enter')
      const drawer = page.getByRole('dialog', { name: 'Filtros' })
      await expect(drawer).toBeVisible()
      for (let step = 0; step < 25; step++) {
        await page.keyboard.press('Tab')
        expect(await drawer.evaluate((element) => element.contains(document.activeElement))).toBe(true)
      }
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      await expect(trigger).toBeFocused()
    }
  })

  test('reduced motion turns animations and smooth scrolling off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/nfts/${EMERALD.id}`)
    await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
    const styles = await page
      .getByTestId('recommendations-carousel')
      .getByRole('list')
      .evaluate((element) => ({
        scroll: getComputedStyle(element).scrollBehavior,
        transition: getComputedStyle(element.querySelector('img')!).transitionDuration,
      }))
    expect(styles.scroll).toBe('auto')
    expect(parseFloat(styles.transition)).toBeLessThan(0.01)
  })
})
