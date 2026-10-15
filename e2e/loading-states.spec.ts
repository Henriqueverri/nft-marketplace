import { expect, test } from '@playwright/test'
import { CATALOG_TOTAL, catalogStatus, EMERALD, expectCatalogCount, searchCatalog, setScenario } from './support/catalog'

test.describe('loading, empty and error states @catalog', () => {
  test('the catalog shows a skeleton while loading', async ({ page }) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    await setScenario(page, { latencyMs: 1500, failure: 'none' })
    await page.reload()
    await expect(page.getByTestId('catalog-skeleton')).toBeVisible()
    await expect(catalogStatus(page)).toHaveText('Carregando NFTs…')
    await expectCatalogCount(page, CATALOG_TOTAL)
    await expect(page.getByTestId('catalog-skeleton')).toHaveCount(0)
  })

  test('a search without results offers to clear the filters', async ({ page }) => {
    await page.goto('/?q=nada-por-aqui&networks=solana')
    await expectCatalogCount(page, 0)
    const empty = page.getByTestId('catalog-empty')
    await expect(empty).toContainText('Nenhum NFT corresponde à sua busca.')
    await empty.getByRole('button', { name: 'Limpar filtros' }).click()
    await expectCatalogCount(page, CATALOG_TOTAL)
    await expect(page).toHaveURL((url) => url.search === '')
  })

  test('a catalog error offers a retry that recovers', async ({ page }) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    await setScenario(page, { latencyMs: 0, failure: 'server-error' })
    await page.reload()
    const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os NFTs.' })
    await expect(alert).toContainText('Erro interno simulado pelo cenário de falha.')
    await setScenario(page, { latencyMs: 100, failure: 'none' })
    await alert.getByRole('button', { name: 'Tentar novamente' }).click()
    await expectCatalogCount(page, CATALOG_TOTAL)
  })

  test('a failed search shows the error and recovers on retry', async ({ page }) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    await setScenario(page, { latencyMs: 0, failure: 'server-error' })
    await searchCatalog(page, 'golden')
    const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar os NFTs.' })
    await expect(alert).toBeVisible()
    // The previous page is not passed off as the result of the new search.
    await expect(page.getByRole('list', { name: 'NFTs', exact: true })).toHaveCount(0)
    await setScenario(page, { latencyMs: 100, failure: 'none' })
    await alert.getByRole('button', { name: 'Tentar novamente' }).click()
    await expectCatalogCount(page, 3)
    await expect(alert).toHaveCount(0)
  })

  test('the detail page has loading and error states with retry', async ({ page }) => {
    await page.goto('/')
    await expectCatalogCount(page, CATALOG_TOTAL)
    await setScenario(page, { latencyMs: 1500, failure: 'none' })
    await page.goto(`/nfts/${EMERALD.id}`)
    await expect(page.getByTestId('nft-detail-skeleton')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()

    await setScenario(page, { latencyMs: 0, failure: 'server-error' })
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Não foi possível carregar este NFT' })).toBeVisible()
    await setScenario(page, { latencyMs: 100, failure: 'none' })
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
    // The carousels failed too and recover on their own retry.
    for (const testId of ['related-carousel', 'recommendations-carousel']) {
      const carousel = page.getByTestId(testId)
      const retry = carousel.getByRole('button', { name: 'Tentar novamente' })
      if (await retry.count()) await retry.click()
      await expect(carousel.getByTestId('nft-card').first()).toBeVisible()
    }
  })
})
