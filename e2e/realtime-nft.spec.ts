import { expect, test, type Page } from '@playwright/test'
import { ANA, BRUNO, fillLogin, login, logout } from './support/auth'
import {
  announcer,
  apiNftPrice,
  catalogCard,
  detailPrice,
  EMERALD,
  expectCatalogCount,
  requestCount,
  searchCatalog,
  userFavorites,
  updateNftPrice,
  waitForRefusedReconnections,
} from './support/catalog'
import { callMockControl, type MockConnections } from './support/mock-control'

/** Neon Vessel is a seed favorite of Ana (src/mocks/db/seed.ts). */
const NEON = { id: 'neon-vessel-552', name: 'Neon Vessel #552' }

/** REST reads that carry NFT prices: catalog, detail, carousels and favorites. */
const PRICE_READS = /^GET \/api\/(nfts|account\/favorites)/

/** Client-side user switch (no reload), ending on the Emerald detail page. */
async function switchUserTo(page: Page, user: typeof ANA) {
  await logout(page)
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrar' }).click()
  await fillLogin(page, user.email, user.password)
  await expect(page.getByTestId('realtime-identity')).toHaveText(user.id)
  await searchCatalog(page, 'emerald')
  await catalogCard(page, EMERALD.name).getByRole('link', { name: EMERALD.name }).click()
  await expect(page.getByRole('heading', { level: 1, name: EMERALD.name })).toBeVisible()
}

test.describe('nft.updated over Socket.IO @realtime', () => {
  test('an update reaches the catalog, the detail and the favorites, matching REST and a refresh', async ({ page }, testInfo) => {
    await login(page, ANA)
    await page.goto('/?q=neon%20vessel')
    await expectCatalogCount(page, 1)
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    const price = catalogCard(page, NEON.name).getByTestId('nft-price')
    await expect(price).toHaveText('1.99 ETH')

    const update = await updateNftPrice(page, NEON.id, '1.49')
    expect(update.delivered).toBe(1)
    await expect(price).toHaveText('1.49 ETH')
    await expect(page.getByTestId('realtime-events-applied')).toHaveText('1')

    // Detail and favorites read the same value from the cache and from REST.
    await catalogCard(page, NEON.name).getByRole('link', { name: NEON.name }).click()
    await expect(detailPrice(page, testInfo)).toHaveText('1.49 ETH')
    await updateNftPrice(page, NEON.id, '1.39')
    await expect(detailPrice(page, testInfo)).toHaveText('1.39 ETH')
    await expect(announcer(page)).toHaveText(`Preço de ${NEON.name} atualizado para 1.39 ETH.`)

    await page.goto('/account/favorites')
    const favorite = page.getByRole('list', { name: 'NFTs salvos' }).getByTestId('nft-card').filter({ hasText: NEON.name })
    await expect(favorite.getByTestId('nft-price')).toHaveText('1.39 ETH')
    await updateNftPrice(page, NEON.id, '1.29')
    await expect(favorite.getByTestId('nft-price')).toHaveText('1.29 ETH')

    expect(await apiNftPrice(page, NEON.id)).toBe('1.29')
    await page.goto(`/nfts/${NEON.id}`)
    await expect(detailPrice(page, testInfo)).toHaveText('1.29 ETH')
    expect(await userFavorites(page, ANA.id)).toContain(NEON.id)
  })

  test('duplicate and stale events never move the data backwards', async ({ page }, testInfo) => {
    await page.goto(`/nfts/${EMERALD.id}`)
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    await expect(detailPrice(page, testInfo)).toHaveText(`${EMERALD.price} ETH`)

    await updateNftPrice(page, EMERALD.id, '0.99')
    await updateNftPrice(page, EMERALD.id, '0.89')
    await expect(detailPrice(page, testInfo)).toHaveText('0.89 ETH')
    await expect(page.getByTestId('realtime-events-applied')).toHaveText('2')

    const duplicate = await callMockControl<{ delivered: number }>(page, `/__mock/nfts/${EMERALD.id}/replay`, 'POST', { kind: 'duplicate' })
    expect(duplicate.delivered).toBe(1)
    await expect(page.getByTestId('realtime-events-ignored')).toHaveText('1')

    // A delayed message: new eventId, previous version (0.99).
    const stale = await callMockControl<{ version: number; delivered: number }>(page, `/__mock/nfts/${EMERALD.id}/replay`, 'POST', { kind: 'stale' })
    expect(stale.delivered).toBe(1)
    await expect(page.getByTestId('realtime-events-applied')).toHaveText('3')
    await expect(detailPrice(page, testInfo)).toHaveText('0.89 ETH')

    await page.reload()
    await expect(detailPrice(page, testInfo)).toHaveText('0.89 ETH')
  })

  test('with the socket blocked the change does not appear; on reconnect REST reconciles it', async ({ page }, testInfo) => {
    await page.goto(`/nfts/${EMERALD.id}`)
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
    await expect(detailPrice(page, testInfo)).toHaveText(`${EMERALD.price} ETH`)
    await expect(page.getByTestId('realtime-notice')).toHaveCount(0)

    await callMockControl(page, '/__mock/socket/block', 'POST', { blocked: true })
    await expect(page.getByTestId('realtime-state')).toHaveText('desconectado')
    await expect(page.getByTestId('realtime-notice')).toContainText('Conexão em tempo real interrompida')

    const update = await updateNftPrice(page, EMERALD.id, '0.79')
    expect(update.delivered).toBe(0)
    expect(await apiNftPrice(page, EMERALD.id)).toBe('0.79')
    const restReadsWhileBlocked = await requestCount(page, PRICE_READS)
    // Several reconnection attempts fail meanwhile; nothing else refreshes the price:
    // no REST read is made and the screen keeps the old value.
    await waitForRefusedReconnections(page, 3)
    await expect(detailPrice(page, testInfo)).toHaveText(`${EMERALD.price} ETH`)
    await expect(page.getByTestId('realtime-reconciliations')).toHaveText('0')
    expect(await requestCount(page, PRICE_READS)).toBe(restReadsWhileBlocked)

    await callMockControl(page, '/__mock/socket/block', 'POST', { blocked: false })
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado', { timeout: 15_000 })
    await expect(detailPrice(page, testInfo)).toHaveText('0.79 ETH')
    await expect(page.getByTestId('realtime-reconciliations')).toHaveText('1')
    // The new price came from the REST reconciliation that followed the reconnection.
    expect(await requestCount(page, PRICE_READS)).toBeGreaterThan(restReadsWhileBlocked)
    await expect(page.getByTestId('realtime-notice')).toHaveCount(0)

    await page.reload()
    await expect(detailPrice(page, testInfo)).toHaveText('0.79 ETH')
    expect(await apiNftPrice(page, EMERALD.id)).toBe('0.79')
  })

  test('the catalog list is reconciled after a server-side disconnect', async ({ page }) => {
    await page.goto('/?q=emerald')
    await expectCatalogCount(page, 1)
    const price = catalogCard(page, EMERALD.name).getByTestId('nft-price')
    await expect(page.getByTestId('realtime-state')).toHaveText('conectado')

    await callMockControl(page, '/__mock/socket/block', 'POST', { blocked: true })
    await expect(page.getByTestId('realtime-state')).toHaveText('desconectado')
    await updateNftPrice(page, EMERALD.id, '1.05')
    const restReadsWhileBlocked = await requestCount(page, PRICE_READS)
    await waitForRefusedReconnections(page, 2)
    await expect(price).toHaveText(`${EMERALD.price} ETH`)
    expect(await requestCount(page, PRICE_READS)).toBe(restReadsWhileBlocked)

    await callMockControl(page, '/__mock/socket/block', 'POST', { blocked: false })
    await expect(price).toHaveText('1.05 ETH', { timeout: 15_000 })
  })

  test('after user switches there is one socket, one listener and one effect per event', async ({ page }, testInfo) => {
    await login(page, ANA)
    await page.goto(`/nfts/${EMERALD.id}`)
    await expect(page.getByTestId('realtime-identity')).toHaveText(ANA.id)
    await page.evaluate(() => {
      ;(window as unknown as { __kurioNoReload: boolean }).__kurioNoReload = true
    })

    // Ana → Bruno → Ana → Bruno: listeners left by any earlier session would show up as
    // extra connections, subscriptions or effects.
    const switches = [
      { user: BRUNO, price: '0.69' },
      { user: ANA, price: '0.59' },
      { user: BRUNO, price: '0.49' },
    ]
    for (const { user, price } of switches) {
      await switchUserTo(page, user)
      await expect(page.getByTestId('realtime-state')).toHaveText('conectado')
      await expect(page.getByTestId('realtime-subscriptions')).toHaveText('1')
      const { connections } = await callMockControl<MockConnections>(page, '/__mock/socket/connections')
      expect(connections).toEqual([expect.objectContaining({ userId: user.id })])

      const update = await updateNftPrice(page, EMERALD.id, price)
      expect(update.delivered).toBe(1)
      await expect(detailPrice(page, testInfo)).toHaveText(`${price} ETH`)
      await expect(page.getByTestId('realtime-events-applied')).toHaveText('1')
      await expect(page.getByTestId('realtime-events-ignored')).toHaveText('0')
      await expect(announcer(page)).toHaveText(`Preço de ${EMERALD.name} atualizado para ${price} ETH.`)
    }

    // Same document all along: the old sessions' listeners could only be gone by cleanup.
    expect(await page.evaluate(() => (window as unknown as { __kurioNoReload?: boolean }).__kurioNoReload)).toBe(true)
    // Private data is untouched by the public event.
    expect(await userFavorites(page, BRUNO.id)).toEqual(['ivory-baron-088'])
    expect(await userFavorites(page, ANA.id)).toEqual(['golden-beat-207', NEON.id])
    expect(await apiNftPrice(page, EMERALD.id)).toBe('0.49')
  })
})
