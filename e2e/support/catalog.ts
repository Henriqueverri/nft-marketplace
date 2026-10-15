import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { callMockControl, type MockConnections } from './mock-control'
import { isMobile } from './auth'

/** Seed facts (src/mocks/db/seed.ts), duplicated on purpose: tests never import app code. */
export const CATALOG_TOTAL = 48
export const EMERALD = { id: 'emerald-ape-042', name: 'Emerald Ape #042', price: '1.19' }

export function catalogStatus(page: Page): Locator {
  return page.getByTestId('catalog-status')
}

export async function expectCatalogCount(page: Page, count: number) {
  const text = count === 0 ? 'Nenhum NFT encontrado.' : `${count} ${count === 1 ? 'NFT encontrado' : 'NFTs encontrados'}`
  await expect(catalogStatus(page)).toHaveText(text)
  if (count === 0) await expect(page.getByTestId('catalog-empty')).toBeVisible()
  else await expect(catalogGrid(page)).not.toHaveAttribute('aria-busy', 'true')
}

export function catalogGrid(page: Page): Locator {
  return page.getByRole('list', { name: 'NFTs', exact: true })
}

/** Names of the cards on the current catalog page, in order. */
export async function catalogNames(page: Page): Promise<string[]> {
  return catalogGrid(page).getByRole('heading').allTextContents()
}

export function catalogCard(page: Page, name: string): Locator {
  return catalogGrid(page).getByTestId('nft-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
}

/** The search box of the current layout (sidebar on desktop, top bar on mobile). */
export function searchBox(page: Page): Locator {
  return page.getByRole('searchbox', { name: 'Buscar NFTs' }).filter({ visible: true })
}

export async function searchCatalog(page: Page, term: string) {
  const box = searchBox(page)
  await box.fill(term)
  await box.press('Enter')
}

/**
 * Runs `action` inside the filter panel of the current layout: the sidebar on
 * desktop, the drawer on mobile (closed again with "Ver N resultados").
 */
export async function withFilters(page: Page, testInfo: TestInfo, action: (panel: Locator) => Promise<void>) {
  if (!isMobile(testInfo)) {
    await action(page.getByRole('complementary', { name: 'Filtros do catálogo' }))
    return
  }
  await page.getByRole('button', { name: /^Filtros/ }).click()
  const drawer = page.getByRole('dialog', { name: 'Filtros' })
  await action(drawer)
  await drawer.getByRole('button', { name: /^Ver .*resultados$/ }).click()
  await expect(drawer).toHaveCount(0)
}

export async function chooseSort(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Ordenar por:' }).click()
  await page.getByRole('option', { name: label, exact: true }).click()
}

export function searchParams(page: Page): URLSearchParams {
  return new URL(page.url()).searchParams
}

/** Price of the selected edition on the detail page (buy bar on mobile). */
export function detailPrice(page: Page, testInfo: TestInfo): Locator {
  return page.getByTestId(isMobile(testInfo) ? 'nft-mobile-price' : 'nft-detail-price')
}

/** Server-side price change (as if made by the seller); emits `nft.updated`. */
export async function updateNftPrice(page: Page, nftId: string, priceEth: string) {
  return callMockControl<{ eventId: string; version: number; delivered: number }>(
    page,
    `/__mock/nfts/${nftId}/update`,
    'POST',
    { priceEth },
  )
}

/** The NFT as the REST API returns it now. */
export async function apiNftPrice(page: Page, nftId: string): Promise<string> {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/nfts/${id}`)
    return ((await response.json()) as { priceEth: string }).priceEth
  }, nftId)
}

export async function setScenario(page: Page, scenario: { latencyMs: number; failure: 'none' | 'server-error' | 'unavailable' | 'offline' }) {
  await callMockControl(page, '/__mock/scenario', 'PUT', scenario)
}

export async function userFavorites(page: Page, userId: string): Promise<string[]> {
  const result = await callMockControl<{ nftIds: string[] }>(page, `/__mock/users/${userId}/favorites`)
  return [...result.nftIds].sort()
}

export function announcer(page: Page): Locator {
  return page.getByTestId('announcer')
}

export interface NetworkActivity {
  inFlight: number
  requests: Record<string, number>
}

/** One-shot delays (and optional failures) for the next matching /api/* requests. */
export async function queueNetwork(
  page: Page,
  entry: {
    pathPrefix: string
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    delaysMs: number[]
    failure?: 'server-error' | 'unavailable' | 'offline'
    /** `response`: the handler runs at once and its answer is held (an answer about an older state). */
    phase?: 'request' | 'response'
  },
) {
  await callMockControl(page, '/__mock/network/delays', 'POST', entry)
}

export function networkActivity(page: Page): Promise<NetworkActivity> {
  return callMockControl<NetworkActivity>(page, '/__mock/network/activity')
}

/** Requests the mock has handled whose `METHOD /path?query` matches `pattern`. */
export async function requestCount(page: Page, pattern: RegExp): Promise<number> {
  const { requests } = await networkActivity(page)
  return Object.entries(requests)
    .filter(([key]) => pattern.test(key))
    .reduce((total, [, count]) => total + count, 0)
}

/**
 * Waits until the mock has answered every /api/* request, delayed ones included.
 * Playwright cannot observe requests answered by the service worker, so the mock
 * reports them itself.
 */
export async function waitForMockIdle(page: Page, timeout = 10_000) {
  await expect.poll(async () => (await networkActivity(page)).inFlight, { timeout }).toBe(0)
}

/**
 * Waits until the blocked socket server has refused `attempts` reconnections, so a
 * negative check covers real retries instead of an arbitrary pause.
 */
export async function waitForRefusedReconnections(page: Page, attempts: number) {
  await expect
    .poll(async () => (await callMockControl<MockConnections>(page, '/__mock/socket/connections')).refusedWhileBlocked, {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(attempts)
}
