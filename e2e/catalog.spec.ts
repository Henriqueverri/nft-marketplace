import { expect, test, type Locator } from '@playwright/test'
import {
  CATALOG_TOTAL,
  catalogNames,
  chooseSort,
  expectCatalogCount,
  queueNetwork,
  requestCount,
  searchBox,
  searchCatalog,
  searchParams,
  waitForMockIdle,
  withFilters,
} from './support/catalog'

/** Checkboxes are visually hidden inside their labels: click the label, as a user does. */
async function checkFacet(panel: Locator, name: RegExp) {
  const checkbox = panel.getByRole('checkbox', { name })
  await panel.locator('label').filter({ has: panel.page().getByRole('checkbox', { name }) }).click()
  await expect(checkbox).toBeChecked()
}

const NAME_PAGE_1_FIRST = 'Amber Echo #380'
const NAME_PAGE_2_FIRST = 'Crimson Rider #275'

test.describe('catalog @catalog', () => {
  test('search, combined filters, sorting and pagination', async ({ page }, testInfo) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)

    await searchCatalog(page, 'golden')
    await expect(page).toHaveURL(/[?&]q=golden/)
    await expectCatalogCount(page, 3)
    for (const name of await catalogNames(page)) expect(name).toMatch(/^Golden /)
    // Accent and case-insensitive, also over collection names.
    await searchCatalog(page, 'MUSICA')
    await expectCatalogCount(page, 6)
    await searchCatalog(page, '')
    await expectCatalogCount(page, CATALOG_TOTAL)
    expect(searchParams(page).has('q')).toBe(false)

    // A filter change goes back to page 1.
    await page.getByRole('navigation', { name: 'Paginação' }).getByRole('link', { name: 'Página 2' }).click()
    await expect(page).toHaveURL(/[?&]page=2/)
    await withFilters(page, testInfo, async (panel) => {
      await checkFacet(panel, /^Música/)
      await checkFacet(panel, /^Arte digital/)
      await checkFacet(panel, /^Ethereum/)
    })
    await expectCatalogCount(page, 6)
    expect(searchParams(page).get('collections')).toBe('col_arte-digital,col_musica')
    expect(searchParams(page).get('networks')).toBe('ethereum')
    expect(searchParams(page).has('page')).toBe(false)

    await chooseSort(page, 'Menor preço')
    await expect(page).toHaveURL(/[?&]sort=price-asc/)
    await expect.poll(() => catalogNames(page)).toEqual([
      'Silent Oracle #226',
      'Rusty Relic #415',
      'Emerald Ape #042',
      'Velvet Echo #352',
      'Lunar Rider #289',
      'Crimson Drifter #163',
    ])

    // Price range: the slider is a draft until "Aplicar".
    await withFilters(page, testInfo, async (panel) => {
      const maxThumb = panel.getByRole('slider', { name: 'Preço máximo' })
      await maxThumb.focus()
      for (let step = 0; step < 10; step++) await maxThumb.press('PageDown')
      await expect(panel.getByText('Preço: 0,10 - 2,99 ETH')).toBeVisible()
      expect(searchParams(page).has('maxPrice')).toBe(false)
      await panel.getByRole('button', { name: 'Aplicar' }).click()
    })
    await expect(page).toHaveURL(/[?&]maxPrice=2\.99/)
    await expectCatalogCount(page, 4)
    expect(await catalogNames(page)).toEqual(['Silent Oracle #226', 'Rusty Relic #415', 'Emerald Ape #042', 'Velvet Echo #352'])

    await withFilters(page, testInfo, async (panel) => {
      await panel.getByRole('button', { name: 'Limpar filtros' }).click()
    })
    await expectCatalogCount(page, CATALOG_TOTAL)
    expect([...searchParams(page).keys()]).toEqual(['sort'])

    await chooseSort(page, 'Nome (A–Z)')
    await expect.poll(async () => (await catalogNames(page))[0]).toBe(NAME_PAGE_1_FIRST)
    const pagination = page.getByRole('navigation', { name: 'Paginação' })
    await pagination.getByRole('link', { name: 'Próxima página' }).click()
    await expect(pagination.getByRole('link', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page')
    await expect.poll(async () => (await catalogNames(page))[0]).toBe(NAME_PAGE_2_FIRST)
    // Keyboard users continue from the top of the new page.
    await expect(page.getByTestId('catalog-status')).toBeFocused()
    await pagination.getByRole('link', { name: 'Página 6' }).click()
    await expect(page).toHaveURL(/[?&]page=6/)
    await expect.poll(() => catalogNames(page)).toHaveLength(CATALOG_TOTAL - 5 * 9)
    await expect(pagination.getByRole('link', { name: 'Próxima página' })).toHaveCount(0)
    await pagination.getByRole('link', { name: 'Página anterior' }).click()
    await expect(page).toHaveURL(/[?&]page=5/)
  })

  test('the URL restores the state on back, forward and refresh', async ({ page }) => {
    await page.goto('/?sort=name&page=2')
    await expect.poll(async () => (await catalogNames(page))[0]).toBe(NAME_PAGE_2_FIRST)
    await expect(page.getByRole('combobox', { name: 'Ordenar por:' })).toHaveText('Nome (A–Z)')

    await page.getByRole('navigation', { name: 'Paginação' }).getByRole('link', { name: 'Página 3' }).click()
    await expect(page).toHaveURL(/[?&]page=3/)
    await expect.poll(async () => (await catalogNames(page))[0]).not.toBe(NAME_PAGE_2_FIRST)
    const page3 = await catalogNames(page)

    await searchCatalog(page, 'electric')
    await expectCatalogCount(page, 5)
    expect(searchParams(page).get('page')).toBeNull()

    await page.goBack()
    await expect(page).toHaveURL(/[?&]page=3/)
    await expect(searchBox(page)).toHaveValue('')
    await expect.poll(() => catalogNames(page)).toEqual(page3)

    await page.goBack()
    await expect.poll(async () => (await catalogNames(page))[0]).toBe(NAME_PAGE_2_FIRST)

    await page.goForward()
    await page.goForward()
    await expect(searchBox(page)).toHaveValue('electric')
    await expectCatalogCount(page, 5)

    await page.reload()
    await expect(searchBox(page)).toHaveValue('electric')
    await expectCatalogCount(page, 5)
    await expect(page.getByRole('combobox', { name: 'Ordenar por:' })).toHaveText('Nome (A–Z)')
  })

  test('views are links that keep the other filters', async ({ page }) => {
    await page.goto('/?networks=solana')
    await expectCatalogCount(page, 16)
    const views = page.getByRole('navigation', { name: 'Seções do catálogo' })
    await expect(views.getByRole('link', { name: 'Todos os NFTs' })).toHaveAttribute('aria-current', 'page')
    await views.getByRole('link', { name: 'Em alta' }).click()
    await expect(page).toHaveURL(/view=trending/)
    await expect(views.getByRole('link', { name: 'Em alta' })).toHaveAttribute('aria-current', 'page')
    expect(searchParams(page).get('networks')).toBe('solana')
    await expect(page.getByTestId('catalog-status')).toHaveText(/NFTs? encontrados?$/)
  })

  test('invalid parameters are normalized in the URL', async ({ page }) => {
    await page.goto('/?page=abc&sort=zzz&view=bad&minPrice=3&maxPrice=1&networks=marte,solana&q=%20%20')
    await expect(page.getByTestId('catalog-status')).toHaveText(/encontrados?$/)
    await expect.poll(() => Object.fromEntries(searchParams(page))).toEqual({
      networks: 'solana',
      minPrice: '1',
      maxPrice: '3',
    })

    // A page past the end is replaced by the last page.
    await page.goto('/?page=99')
    await expect(page).toHaveURL(/[?&]page=6$/)
    await expect.poll(() => catalogNames(page)).toHaveLength(CATALOG_TOTAL - 5 * 9)
  })

  test('an older response arriving last never replaces the current result', async ({ page }) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    // The first list request is slowed down; the second one answers at once.
    await queueNetwork(page, { pathPrefix: '/api/nfts', method: 'GET', delaysMs: [2500, 0] })

    await searchCatalog(page, 'golden')
    await expect(page).toHaveURL(/[?&]q=golden/)
    await searchCatalog(page, 'emerald')
    await expectCatalogCount(page, 1)
    expect(await catalogNames(page)).toEqual(['Emerald Ape #042'])

    // The late "golden" response is answered after this point. It can only fill its own
    // cache entry (or be dropped as cancelled); it must not replace the current result.
    await waitForMockIdle(page)
    expect(await requestCount(page, /^GET \/api\/nfts\?.*q=golden/)).toBe(1)
    await expectCatalogCount(page, 1)
    expect(await catalogNames(page)).toEqual(['Emerald Ape #042'])
    expect(searchParams(page).get('q')).toBe('emerald')
  })
})
