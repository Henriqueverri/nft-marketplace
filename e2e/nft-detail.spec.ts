import { expect, test } from '@playwright/test'
import { isMobile } from './support/auth'
import { announcer, catalogCard, detailPrice, EMERALD } from './support/catalog'

test.describe('NFT detail @catalog', () => {
  test('direct access shows the NFT, its editions and an honest buy state', async ({ page }, testInfo) => {
    await page.goto(`/nfts/${EMERALD.id}`)
    await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
    await expect(page).toHaveTitle(/Kurio/)
    // Default edition: the cheapest one available.
    await expect(detailPrice(page, testInfo)).toHaveText(`${EMERALD.price} ETH`)

    const editions = page.getByRole('radiogroup', { name: 'Edição:' })
    await expect(editions.getByRole('radio')).toHaveCount(4)
    await expect(editions.getByRole('radio', { name: /^Aberta/ })).toBeChecked()
    await expect(editions.getByRole('radio', { name: /^1\/50\W+esgotada/ })).toBeDisabled()

    await editions.locator('label').filter({ hasText: '1/10' }).click()
    await expect(editions.getByRole('radio', { name: /^1\/10/ })).toBeChecked()
    await expect(detailPrice(page, testInfo)).toHaveText('1.89 ETH')

    const quantity = page.getByRole('group', { name: 'Quantidade' }).filter({ visible: true })
    const increase = quantity.getByRole('button', { name: 'Aumentar quantidade' })
    await increase.click()
    await increase.click()
    await expect(quantity.getByRole('status', { name: 'Quantidade selecionada' })).toHaveText('3')
    // 1/10 allows at most 3 per order.
    await expect(increase).toBeDisabled()

    const buy = isMobile(testInfo)
      ? page.getByRole('region', { name: 'Compra' }).getByRole('button', { name: 'Comprar NFT' })
      : page.getByRole('button', { name: 'COMPRAR' })
    await buy.click()
    const notice = 'A compra ainda não está disponível nesta demonstração. Sua seleção: 3 × edição 1/10, total de 5.67 ETH.'
    await expect(announcer(page)).toHaveText(notice)
    await expect(page).toHaveURL(new RegExp(`/nfts/${EMERALD.id}$`))

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
    await expect(detailPrice(page, testInfo)).toHaveText(`${EMERALD.price} ETH`)
  })

  test('opening a card from the catalog goes to its detail page', async ({ page }) => {
    await page.goto('/?q=emerald')
    await catalogCard(page, EMERALD.name).getByRole('link', { name: EMERALD.name }).click()
    await expect(page).toHaveURL(new RegExp(`/nfts/${EMERALD.id}$`))
    await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/\?q=emerald$/)
  })

  test('an unknown NFT shows a not-found page', async ({ page }) => {
    await page.goto('/nfts/nao-existe-999')
    await expect(page.getByRole('heading', { level: 1, name: 'NFT não encontrado' })).toBeVisible()
    await page.getByRole('link', { name: 'Voltar ao catálogo' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await expect(page.getByTestId('catalog-status')).toHaveText(/NFTs encontrados$/)
  })

  test('tabs work with the keyboard and load the reviews on demand', async ({ page }) => {
    await page.goto(`/nfts/${EMERALD.id}`)
    const tablist = page.getByRole('tablist')
    const details = tablist.getByRole('tab', { name: 'Detalhes do NFT' })
    const reviews = tablist.getByRole('tab', { name: 'Avaliações de colecionadores (19)' })
    await expect(details).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toContainText('Contrato inteligente ERC-721 verificado')

    await details.focus()
    await page.keyboard.press('ArrowRight')
    await expect(reviews).toBeFocused()
    await expect(reviews).toHaveAttribute('aria-selected', 'true')
    const panel = page.getByRole('tabpanel', { name: 'Avaliações de colecionadores (19)' })
    await expect(panel.getByRole('list', { name: 'Avaliações' }).getByRole('listitem')).toHaveCount(19)

    await page.keyboard.press('ArrowLeft')
    await expect(details).toHaveAttribute('aria-selected', 'true')
  })

  test('carousels show the same collection and recommendations', async ({ page }, testInfo) => {
    await page.goto(`/nfts/${EMERALD.id}`)
    const related = page.getByTestId('related-carousel')
    await expect(related.getByRole('heading', { name: 'Mais desta coleção' })).toBeVisible()
    await expect(related.getByTestId('nft-card')).toHaveCount(5)
    await expect(related.getByRole('heading', { name: EMERALD.name })).toHaveCount(0)

    const recommendations = page.getByTestId('recommendations-carousel')
    await expect(recommendations.getByTestId('nft-card')).toHaveCount(6)
    const next = recommendations.getByRole('button', { name: 'Colecionadores também viram: próximos' })
    const previous = recommendations.getByRole('button', { name: 'Colecionadores também viram: anteriores' })
    const pages = recommendations.getByRole('group', { name: 'Páginas de Colecionadores também viram' })
    await expect(previous).toBeDisabled()
    await expect(pages.getByRole('button', { name: /^Página 1 de/ })).toHaveAttribute('aria-pressed', 'true')
    await next.click()
    await expect(pages.getByRole('button', { name: /^Página 2 de/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(previous).toBeEnabled()
    if (!isMobile(testInfo)) await expect(next).toBeDisabled()

    // A card of the carousel opens its own detail with a fresh selection.
    const target = related.getByTestId('nft-card').first()
    const name = (await target.getByRole('heading').textContent())!
    await target.getByRole('link', { name }).click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    await expect(page.getByRole('radiogroup', { name: 'Edição:' }).getByRole('radio', { checked: true })).toHaveCount(1)
  })
})
