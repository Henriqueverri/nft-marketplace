import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { ANA, BRUNO, fillLogin, isMobile, login, logout } from './support/auth'
import {
  announcer,
  catalogCard,
  EMERALD,
  queueNetwork,
  requestCount,
  searchCatalog,
  setScenario,
  userFavorites,
  waitForMockIdle,
} from './support/catalog'

/** Seed favorites (src/mocks/db/seed.ts). */
const ANA_FAVORITES = ['golden-beat-207', 'neon-vessel-552']
const BRUNO_FAVORITES = ['ivory-baron-088']
/** Two NFTs that no seed user has saved, listed together by `?q=nomad`. */
const SAGE = { id: 'sage-nomad-009', name: 'Sage Nomad #009' }
const VIOLET = { id: 'violet-nomad-314', name: 'Violet Nomad #314' }
const LIST_READS = /^GET \/api\/account\/favorites$/

function cardFavorite(page: Page, name: string) {
  return catalogCard(page, name).getByRole('button', { name: `Favoritar ${name}` })
}

/** The favorite button of the detail page: labeled on desktop, an icon on mobile. */
function detailFavorite(page: Page, testInfo: TestInfo) {
  return isMobile(testInfo)
    ? page.getByRole('button', { name: `Favoritar ${EMERALD.name}` })
    : page.getByRole('button', { name: 'Favoritar', exact: true })
}

/** Finds the card with the catalog search (client-side) and checks its favorite state. */
async function expectFavorite(page: Page, name: string, pressed: boolean) {
  await searchCatalog(page, name)
  await expect(cardFavorite(page, name)).toHaveAttribute('aria-pressed', String(pressed))
}

async function openFavorites(page: Page) {
  await page.getByRole('link', { name: 'Lista de interesse', exact: true }).filter({ visible: true }).first().click()
  await expect(page).toHaveURL(/\/account\/favorites$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Lista de interesse' })).toBeVisible()
}

function savedNames(page: Page) {
  return page.getByRole('list', { name: 'NFTs salvos' }).getByRole('heading')
}

test.describe('favorites @favorites', () => {
  test('favorite and unfavorite from the catalog, the detail and the list', async ({ page }, testInfo) => {
    await login(page, ANA)
    await page.goto('/?q=emerald')
    const button = cardFavorite(page, EMERALD.name)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(announcer(page)).toHaveText(`${EMERALD.name} adicionado à lista de interesse.`)
    await expect.poll(() => userFavorites(page, ANA.id)).toEqual([EMERALD.id, ...ANA_FAVORITES].sort())

    // The detail page shows the same state, and can undo it.
    await catalogCard(page, EMERALD.name).getByRole('link', { name: EMERALD.name }).click()
    const detailButton = detailFavorite(page, testInfo)
    await expect(detailButton).toHaveAttribute('aria-pressed', 'true')
    await detailButton.click()
    await expect(detailButton).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toHaveText(`${EMERALD.name} removido da lista de interesse.`)
    await expect.poll(() => userFavorites(page, ANA.id)).toEqual(ANA_FAVORITES)
    await detailButton.click()
    await expect(detailButton).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => userFavorites(page, ANA.id)).toEqual([EMERALD.id, ...ANA_FAVORITES].sort())

    await page.goto('/account/favorites')
    await expect(page.getByTestId('favorites-status')).toHaveText('3 NFTs salvos por Ana Costa')
    await expect(savedNames(page)).toHaveText(['Emerald Ape #042', 'Neon Vessel #552', 'Golden Beat #207'])
    await page.getByRole('button', { name: 'Favoritar Neon Vessel #552' }).click()
    await expect(savedNames(page)).toHaveText(['Emerald Ape #042', 'Golden Beat #207'])
    // Focus is not lost with the removed card.
    await expect(page.getByRole('heading', { level: 1, name: 'Lista de interesse' })).toBeFocused()
    await expect.poll(() => userFavorites(page, ANA.id)).toEqual([EMERALD.id, 'golden-beat-207'])

    await page.reload()
    await expect(savedNames(page)).toHaveText(['Emerald Ape #042', 'Golden Beat #207'])
  })

  test('a visitor goes to login and comes back to the same NFT', async ({ page }, testInfo) => {
    await page.goto(`/nfts/${EMERALD.id}`)
    await detailFavorite(page, testInfo).click()
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === `/nfts/${EMERALD.id}`)
    await fillLogin(page, BRUNO.email, BRUNO.password)
    await expect(page).toHaveURL(new RegExp(`/nfts/${EMERALD.id}$`))
    const button = detailFavorite(page, testInfo)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => userFavorites(page, BRUNO.id)).toEqual([EMERALD.id, ...BRUNO_FAVORITES].sort())
  })

  test('a failed change is rolled back and announced, never shown as saved', async ({ page }) => {
    await login(page, ANA)
    await page.goto('/?q=emerald')
    const button = cardFavorite(page, EMERALD.name)
    await expect(button).toHaveAttribute('aria-pressed', 'false')

    await setScenario(page, { latencyMs: 800, failure: 'server-error' })
    await button.click()
    // Optimistic while the request is in flight...
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    // ...and undone when the API refuses it.
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toContainText(`Não foi possível favoritar ${EMERALD.name}.`)
    expect(await userFavorites(page, ANA.id)).toEqual(ANA_FAVORITES)

    await setScenario(page, { latencyMs: 100, failure: 'none' })
    await expect(button).not.toHaveAttribute('aria-disabled', 'true')
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => userFavorites(page, ANA.id)).toEqual([EMERALD.id, ...ANA_FAVORITES].sort())
  })

  test('concurrent changes of two NFTs: a late failure undoes only its own NFT', async ({ page }) => {
    await login(page, ANA)
    await page.goto('/?q=nomad')
    const sage = cardFavorite(page, SAGE.name)
    const violet = cardFavorite(page, VIOLET.name)
    await expect(sage).toHaveAttribute('aria-pressed', 'false')
    await expect(violet).toHaveAttribute('aria-pressed', 'false')
    await expect(sage).not.toHaveAttribute('aria-disabled', 'true')
    await waitForMockIdle(page)

    // Sage fails after 1.5 s; Violet succeeds at once. The list refetch that follows the
    // last change is held back, so what the screen shows next is the client-side rollback.
    await queueNetwork(page, { pathPrefix: `/api/account/favorites/${SAGE.id}`, method: 'PUT', delaysMs: [1500], failure: 'server-error' })
    await queueNetwork(page, { pathPrefix: `/api/account/favorites/${VIOLET.id}`, method: 'PUT', delaysMs: [0] })
    await queueNetwork(page, { pathPrefix: '/api/account/favorites', method: 'GET', delaysMs: [3000] })
    const listReads = await requestCount(page, LIST_READS)

    await sage.click()
    await violet.click()
    await expect(sage).toHaveAttribute('aria-pressed', 'true')
    await expect(violet).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => userFavorites(page, ANA.id)).toContain(VIOLET.id)
    await expect(violet).not.toHaveAttribute('aria-disabled', 'true')
    await expect(sage).toHaveAttribute('aria-disabled', 'true')

    await expect(sage).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toContainText(`Não foi possível favoritar ${SAGE.name}.`)
    await expect(violet).toHaveAttribute('aria-pressed', 'true')
    // The refetch is still held back: Violet was kept by the per-item rollback, not by REST.
    expect(await requestCount(page, LIST_READS)).toBe(listReads)

    await waitForMockIdle(page)
    expect(await requestCount(page, LIST_READS)).toBe(listReads + 1)
    await expect(sage).toHaveAttribute('aria-pressed', 'false')
    await expect(violet).toHaveAttribute('aria-pressed', 'true')
    expect(await userFavorites(page, ANA.id)).toEqual([...ANA_FAVORITES, VIOLET.id].sort())
  })

  test('a pending change locks its NFT on every screen until the API answers', async ({ page }, testInfo) => {
    await login(page, ANA)
    await page.goto('/?q=emerald')
    const button = cardFavorite(page, EMERALD.name)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(button).not.toHaveAttribute('aria-disabled', 'true')
    await queueNetwork(page, { pathPrefix: `/api/account/favorites/${EMERALD.id}`, method: 'PUT', delaysMs: [2500], failure: 'server-error' })

    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    // The detail page is another button for the same NFT: it must not start a second,
    // overlapping change that the late rollback could then undo.
    await catalogCard(page, EMERALD.name).getByRole('link', { name: EMERALD.name }).click()
    const detailButton = detailFavorite(page, testInfo)
    await expect(detailButton).toHaveAttribute('aria-pressed', 'true')
    await expect(detailButton).toHaveAttribute('aria-disabled', 'true')
    // `force`: Playwright would otherwise wait for aria-disabled to go away; a user can
    // click (or press Enter on) the focused, locked button at any time.
    await detailButton.click({ force: true })
    await expect(detailButton).toHaveAttribute('aria-pressed', 'true')
    expect(await requestCount(page, /^(PUT|DELETE) \/api\/account\/favorites\//)).toBe(0)

    await expect(detailButton).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).toContainText(`Não foi possível favoritar ${EMERALD.name}.`)
    await expect(detailButton).not.toHaveAttribute('aria-disabled', 'true')
    expect(await requestCount(page, /^(PUT|DELETE) \/api\/account\/favorites\//)).toBe(1)
    expect(await userFavorites(page, ANA.id)).toEqual(ANA_FAVORITES)

    await detailButton.click()
    await expect(detailButton).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => userFavorites(page, ANA.id)).toEqual([EMERALD.id, ...ANA_FAVORITES].sort())
  })

  test('a change still pending when the user switches never reaches the new session', async ({ page }) => {
    await login(page, ANA)
    await page.goto('/?q=emerald')
    const button = cardFavorite(page, EMERALD.name)
    await expect(button).not.toHaveAttribute('aria-disabled', 'true')
    await queueNetwork(page, { pathPrefix: `/api/account/favorites/${EMERALD.id}`, method: 'PUT', delaysMs: [4000] })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')

    await logout(page)
    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrar' }).click()
    await fillLogin(page, BRUNO.email, BRUNO.password)
    await expect(page.getByTestId('session-user')).toHaveText(`@${BRUNO.username}`)
    // Ana's request is still on its way: the switch really happened in the middle of it.
    expect(await requestCount(page, /^PUT \/api\/account\/favorites\//)).toBe(0)
    await expectFavorite(page, EMERALD.name, false)

    await waitForMockIdle(page)
    expect(await requestCount(page, /^PUT \/api\/account\/favorites\//)).toBe(1)
    // Its answer (401: Ana's session was revoked at logout) neither ends Bruno's session,
    // nor changes his list, nor is announced to him.
    await expect(page.getByTestId('session-user')).toHaveText(`@${BRUNO.username}`)
    await expect(cardFavorite(page, EMERALD.name)).toHaveAttribute('aria-pressed', 'false')
    await expect(announcer(page)).not.toContainText('Não foi possível')
    expect(await userFavorites(page, BRUNO.id)).toEqual(BRUNO_FAVORITES)
    expect(await userFavorites(page, ANA.id)).toEqual(ANA_FAVORITES)
  })

  test('favorites are isolated per user and follow a user switch without a refresh', async ({ page }) => {
    await login(page, ANA)
    await page.evaluate(() => {
      ;(window as unknown as { __kurioNoReload: boolean }).__kurioNoReload = true
    })
    await expectFavorite(page, 'Neon Vessel #552', true)
    await expectFavorite(page, 'Ivory Baron #088', false)
    await searchCatalog(page, 'Electric Echo #366')
    await cardFavorite(page, 'Electric Echo #366').click()
    await expect(cardFavorite(page, 'Electric Echo #366')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => userFavorites(page, ANA.id)).toContain('electric-echo-366')

    await logout(page)
    // Visitors see no favorite marked.
    await expectFavorite(page, 'Electric Echo #366', false)

    await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrar' }).click()
    await fillLogin(page, BRUNO.email, BRUNO.password)
    await expect(page.getByTestId('session-user')).toHaveText(`@${BRUNO.username}`)
    await expectFavorite(page, 'Electric Echo #366', false)
    await expectFavorite(page, 'Neon Vessel #552', false)
    await expectFavorite(page, 'Ivory Baron #088', true)

    await openFavorites(page)
    await expect(savedNames(page)).toHaveText(['Ivory Baron #088'])
    await expect(page.getByText('Neon Vessel #552')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __kurioNoReload?: boolean }).__kurioNoReload)).toBe(true)

    expect(await userFavorites(page, BRUNO.id)).toEqual(BRUNO_FAVORITES)
    expect(await userFavorites(page, ANA.id)).toEqual([...ANA_FAVORITES, 'electric-echo-366'].sort())
  })

  test('the favorites API refuses requests without a session', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mocks-state')).toHaveText('ativos')
    const statuses = await page.evaluate(async (nftId) => {
      const list = await fetch('/api/account/favorites')
      const add = await fetch(`/api/account/favorites/${nftId}`, { method: 'PUT' })
      return [list.status, add.status]
    }, EMERALD.id)
    expect(statuses).toEqual([401, 401])
  })

  test('the list has loading, empty and error states', async ({ page }) => {
    // The profile page has no NFT cards, so the list is not cached when it opens.
    // On desktop the login modal sits over the home, whose cards may load the list
    // right after signing in; a reload on the profile starts from an empty cache.
    const fromProfile = '/login?redirect=%2Faccount%2Fprofile'
    await login(page, BRUNO, fromProfile)
    await expect(page).toHaveURL(/\/account\/profile$/)
    await page.reload()
    await expect(page.getByTestId('session-user')).toHaveText(`@${BRUNO.username}`)
    await setScenario(page, { latencyMs: 1500, failure: 'none' })
    await openFavorites(page)
    await expect(page.getByTestId('favorites-status')).toHaveText('Carregando sua lista…')
    await expect(savedNames(page)).toHaveText(['Ivory Baron #088'])
    await setScenario(page, { latencyMs: 100, failure: 'none' })

    await page.getByRole('button', { name: 'Favoritar Ivory Baron #088' }).click()
    const empty = page.getByTestId('favorites-empty')
    await expect(empty).toBeVisible()
    await expect(empty.getByRole('link', { name: 'Explorar o mercado' })).toBeVisible()
    await expect.poll(() => userFavorites(page, BRUNO.id)).toEqual([])

    // A new session starts with an empty cache; the API is down when the list opens.
    await logout(page)
    await login(page, BRUNO, fromProfile)
    await expect(page).toHaveURL(/\/account\/profile$/)
    await page.reload()
    await expect(page.getByTestId('session-user')).toHaveText(`@${BRUNO.username}`)
    await setScenario(page, { latencyMs: 100, failure: 'unavailable' })
    await openFavorites(page)
    const alert = page.getByRole('alert').filter({ hasText: 'Não foi possível carregar sua lista de interesse.' })
    await expect(alert).toContainText('Serviço temporariamente indisponível.', { timeout: 15_000 })
    await setScenario(page, { latencyMs: 100, failure: 'none' })
    await alert.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(empty).toBeVisible()
  })
})
