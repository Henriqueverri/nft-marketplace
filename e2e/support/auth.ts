import { expect, type Page, type TestInfo } from '@playwright/test'

/** Fictitious seed accounts (src/mocks/db/seed.ts), duplicated on purpose: tests never import app code. */
export const ANA = {
  id: 'usr_ana',
  username: 'ana.coleciona',
  email: 'ana@kurio.test',
  password: 'kurio-ana-2026',
  displayName: 'Ana Costa',
}

export const BRUNO = {
  id: 'usr_bruno',
  username: 'bruno.lima',
  email: 'bruno@kurio.test',
  password: 'kurio-bruno-2026',
  displayName: 'Bruno Lima',
}

export function isMobile(testInfo: TestInfo): boolean {
  return testInfo.project.name === 'mobile'
}

/** Heading of the auth screen: the mobile signup page has its own title (Figma). */
export function authHeading(mode: 'login' | 'signup', testInfo: TestInfo): string {
  if (mode === 'login') return 'Entrar'
  return isMobile(testInfo) ? 'Criar perfil de colecionador' : 'Criar conta'
}

export function signupButtonName(testInfo: TestInfo): string {
  return isMobile(testInfo) ? 'Criar perfil' : 'Criar conta'
}

export async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  // MSW "offline" fails the fetch with no HTTP response (requestfailed); 4xx/5xx still
  // produce a response. Wait for either so scenario tests can settle after Sem rede.
  const isLoginPost = (url: string, method: string) =>
    url.endsWith('/api/auth/login') && method === 'POST'
  const settled = Promise.race([
    page.waitForResponse((candidate) => isLoginPost(candidate.url(), candidate.request().method())),
    page.waitForEvent('requestfailed', {
      predicate: (request) => isLoginPost(request.url(), request.method()),
    }),
  ])
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await settled
}

/** Signs in from /login and waits for the session to be shown in the demo panel. */
export async function login(page: Page, account: { email: string; password: string; username?: string }, path = '/login') {
  await page.goto(path)
  await fillLogin(page, account.email, account.password)
  if (account.username) await expect(page.getByTestId('session-user')).toHaveText(`@${account.username}`)
}

/**
 * Opens login without a full reload when possible (cart/favorites races need an in-app switch).
 * Desktop: visible header "Entrar". Mobile: the same header Link is CSS-hidden (Figma has
 * no top bar) — force-click it so login keeps the current-page redirect (home → /, detail
 * → detail) instead of the profile tab's redirect=/account/profile, which leaves tests
 * stuck on the account shell without the browsing tab bar or catalog search.
 *
 * Locates via CSS: getByRole skips display:none nodes, which is the mobile header.
 */
export async function openLogin(page: Page) {
  const headerLogin = page.locator('header nav[aria-label="Principal"] a').filter({ hasText: /^Entrar$/ })
  if (await headerLogin.isVisible()) {
    await headerLogin.click()
  } else if (await headerLogin.count()) {
    // Mobile: header is display:none — Playwright cannot action it even with force.
    // Native click still runs the TanStack Link handler (SPA, correct redirect search).
    await headerLogin.evaluate((element) => (element as HTMLAnchorElement).click())
  } else {
    await page.goto('/login')
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
}

/**
 * Opens the account profile using whatever chrome is available: browsing tab, footer,
 * account switcher ("Perfil" / "Dados do perfil"), or a direct navigation. No-ops when
 * already there.
 */
export async function openAccountProfile(page: Page) {
  if (/\/account\/profile\/?$/.test(new URL(page.url()).pathname)) return

  const browsingTab = page.getByRole('navigation', { name: 'Atalhos' }).getByRole('link', { name: 'Meu perfil' })
  const footerOrChrome = page.getByRole('link', { name: 'Meu perfil', exact: true }).filter({ visible: true }).first()
  const accountLink = page
    .getByRole('navigation', { name: 'Conta' })
    .getByRole('link', { name: /^(Perfil|Dados do perfil)$/ })

  if (await browsingTab.isVisible()) {
    await browsingTab.click()
  } else if (await footerOrChrome.isVisible()) {
    await footerOrChrome.click()
  } else if (await accountLink.first().isVisible()) {
    await accountLink.first().click()
  } else {
    await page.goto('/account/profile')
  }
  await expect(page).toHaveURL(/\/account\/profile$/)
}

/**
 * Opens the favorites list: browsing tab, footer, account switcher ("Favoritos" on
 * mobile / full label on desktop), or a direct navigation.
 */
export async function openFavorites(page: Page) {
  if (/\/account\/favorites\/?$/.test(new URL(page.url()).pathname)) {
    await expect(page.getByRole('heading', { level: 1, name: 'Lista de interesse' })).toBeVisible()
    return
  }

  const browsingTab = page
    .getByRole('navigation', { name: 'Atalhos' })
    .getByRole('link', { name: 'Lista de interesse' })
  const footerOrChrome = page
    .getByRole('link', { name: 'Lista de interesse', exact: true })
    .filter({ visible: true })
    .first()
  const accountLink = page
    .getByRole('navigation', { name: 'Conta' })
    .getByRole('link', { name: /^(Favoritos|Lista de interesse)$/ })

  if (await browsingTab.isVisible()) {
    await browsingTab.click()
  } else if (await footerOrChrome.isVisible()) {
    await footerOrChrome.click()
  } else if (await accountLink.first().isVisible()) {
    await accountLink.first().click()
  } else {
    await page.goto('/account/favorites')
  }
  await expect(page).toHaveURL(/\/account\/favorites$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Lista de interesse' })).toBeVisible()
}

export async function logout(page: Page, testInfo: TestInfo) {
  if (isMobile(testInfo)) {
    // Prefer visible account-shell "Sair"; otherwise the CSS-hidden header button (same
    // pattern as openLogin) so detail/cart screens logout without a full reload.
    const visibleSair = page.getByRole('button', { name: 'Sair' })
    if (await visibleSair.first().isVisible()) {
      await visibleSair.first().click()
    } else {
      const headerSair = page
        .locator('header nav[aria-label="Principal"] button')
        .filter({ hasText: /^(Sair|Saindo…)$/ })
      if (await headerSair.count()) {
        await headerSair.evaluate((element) => (element as HTMLButtonElement).click())
      } else {
        await page.goto('/account/profile')
        await expect(visibleSair.first()).toBeVisible()
        await visibleSair.first().click()
      }
    }
  } else {
    // Desktop: header and account sidebar both expose "Sair".
    await page.getByRole('button', { name: 'Sair' }).first().click()
  }
  await expect(page.getByTestId('session-user')).toHaveText('visitante')
}
