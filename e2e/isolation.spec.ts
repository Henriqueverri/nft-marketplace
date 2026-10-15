import { expect, test, type Page } from '@playwright/test'
import { ANA, BRUNO, fillLogin, login, logout } from './support/auth'
import { callMockControl, SESSION_STORAGE_KEY, type MockConnections } from './support/mock-control'

/** Marks the document; the mark disappears if the page is ever reloaded. */
async function markDocument(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __kurioNoReload: boolean }).__kurioNoReload = true
  })
}

async function expectSameDocument(page: Page) {
  expect(await page.evaluate(() => (window as unknown as { __kurioNoReload?: boolean }).__kurioNoReload)).toBe(true)
}

async function storageSnapshot(page: Page) {
  return page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    session: Object.fromEntries(Object.entries(sessionStorage)),
  }))
}

async function openProfileFromHeader(page: Page) {
  await page.getByRole('link', { name: 'Meu perfil' }).click()
  await expect(page).toHaveURL(/\/account\/profile$/)
}

test.describe('session isolation @isolation', () => {
  test('user B signs in after A without a refresh and sees nothing of A', async ({ page }) => {
    await login(page, ANA)
    await markDocument(page)

    await openProfileFromHeader(page)
    await expect(page.getByTestId('profile-email')).toHaveText(ANA.email)
    const nameInput = page.getByLabel('Nome de exibição')
    await nameInput.fill('Ana Privada')
    await page.getByRole('button', { name: 'Salvar nome' }).click()
    await expect(page.getByTestId('profile-display-name')).toHaveText('Ana Privada')
    // An unsaved draft of A must not survive A's logout.
    await nameInput.fill('rascunho secreto da Ana')

    await logout(page)
    await page.getByRole('link', { name: 'Entrar' }).click()
    await fillLogin(page, BRUNO.email, BRUNO.password)
    await expect(page.getByTestId('session-user')).toHaveText(`@${BRUNO.username}`)

    await openProfileFromHeader(page)
    await expect(page.getByTestId('profile-email')).toHaveText(BRUNO.email)
    await expect(page.getByTestId('profile-display-name')).toHaveText(BRUNO.displayName)
    await expect(page.getByLabel('Nome de exibição')).toHaveValue(BRUNO.displayName)
    await expect(page.getByText('Restauramos a alteração')).toHaveCount(0)

    const body = await page.locator('body').innerText()
    for (const leaked of [ANA.email, 'Ana Privada', 'rascunho secreto da Ana', ANA.username]) {
      expect(body).not.toContain(leaked)
    }
    await expect(page.getByTestId('realtime-identity')).toHaveText(BRUNO.id)
    await expectSameDocument(page)
  })

  test('logout leaves no private data of A in the browser storage', async ({ page }) => {
    await login(page, ANA)
    await openProfileFromHeader(page)
    await page.getByLabel('Nome de exibição').fill('rascunho da Ana')
    const before = await storageSnapshot(page)
    expect(Object.keys(before.session)).toContain(`kurio:draft:${ANA.id}:profile.displayName`)
    expect(before.local[SESSION_STORAGE_KEY]).toContain(ANA.id)

    await logout(page)
    const after = await storageSnapshot(page)
    expect(after.local[SESSION_STORAGE_KEY]).toBeUndefined()
    expect(Object.keys(after.session).filter((key) => key.includes(ANA.id))).toEqual([])
    // Only the mock database (the simulated server) and the scenario remain.
    expect(Object.keys(after.local).sort()).toEqual(
      expect.arrayContaining(['kurio:mock-db:v1']),
    )
    expect(Object.keys(after.local).filter((key) => !key.startsWith('kurio:mock-'))).toEqual([])
  })

  test('a late response of the previous session is discarded when the session changes', async ({ page, context }) => {
    await login(page, ANA)
    await expect(page).toHaveURL((url) => url.pathname === '/')

    // A second tab of the same browser gets a valid token for Bruno straight from the API.
    const otherTab = await context.newPage()
    await otherTab.goto('/cart')
    await expect(otherTab.getByTestId('mocks-state')).toHaveText('ativos')
    const brunoToken = await otherTab.evaluate(async (account) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(account),
      })
      return ((await response.json()) as { token: string }).token
    }, { email: BRUNO.email, password: BRUNO.password })

    await callMockControl(page, '/__mock/scenario', 'PUT', { latencyMs: 2000, failure: 'none' })
    await page.evaluate((email) => {
      const w = window as unknown as { __kurioSawEmail?: boolean }
      w.__kurioSawEmail = false
      new MutationObserver(() => {
        if (document.body.innerText.includes(email)) w.__kurioSawEmail = true
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
    }, ANA.email)

    // Ana's profile request is now in flight for 2s...
    const anaProfile = page.waitForRequest((r) => r.url().endsWith('/api/account/profile'))
    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await anaProfile
    // ...when the other tab switches the browser session to Bruno.
    await otherTab.evaluate(
      ({ key, token, userId }) => localStorage.setItem(key, JSON.stringify({ token, userId })),
      { key: SESSION_STORAGE_KEY, token: brunoToken, userId: BRUNO.id },
    )

    await expect(page.getByTestId('session-user')).toHaveText(`@${BRUNO.username}`, { timeout: 10_000 })
    await expect(page.getByTestId('profile-email')).toHaveText(BRUNO.email, { timeout: 10_000 })
    expect(await page.evaluate(() => (window as unknown as { __kurioSawEmail: boolean }).__kurioSawEmail)).toBe(false)
  })

  test('logout closes the socket of the session and its listeners', async ({ page }) => {
    await login(page, ANA)
    await openProfileFromHeader(page)
    await expect(page.getByTestId('realtime-identity')).toHaveText(ANA.id)
    // The profile listener plus the app-wide `nft.updated` listener.
    await expect(page.getByTestId('realtime-subscriptions')).toHaveText('2')
    let state = await callMockControl<MockConnections>(page, '/__mock/socket/connections')
    expect(state.connections).toEqual([expect.objectContaining({ userId: ANA.id })])

    await logout(page)
    await expect(page.getByTestId('realtime-identity')).toHaveText('anônima')
    // Only the app-wide `nft.updated` listener, which carries no private data, remains.
    await expect(page.getByTestId('realtime-subscriptions')).toHaveText('1')
    state = await callMockControl<MockConnections>(page, '/__mock/socket/connections')
    expect(state.connections).toHaveLength(1)
    expect(state.connections[0].userId).toBeNull()

    // The server no longer routes A's private events anywhere.
    const delivery = await callMockControl<{ delivered: number }>(page, `/__mock/users/${ANA.id}/profile`, 'POST', {
      displayName: 'Ana Depois',
      delivery: 'owner',
    })
    expect(delivery.delivered).toBe(0)
  })

  test('a forged token never binds a socket to the claimed user', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('realtime-identity')).toHaveText('anônima')
    // A stored session claiming to be Ana, with a token the server never issued.
    await page.evaluate(
      ({ key, userId }) => localStorage.setItem(key, JSON.stringify({ token: 'f'.repeat(43), userId })),
      { key: SESSION_STORAGE_KEY, userId: ANA.id },
    )
    await page.addInitScript(() => {
      const seen: string[] = []
      ;(window as unknown as { __kurioIdentities: string[] }).__kurioIdentities = seen
      new MutationObserver(() => {
        const text = document.querySelector('[data-testid="realtime-identity"]')?.textContent
        if (text) seen.push(text)
      }).observe(document, { subtree: true, childList: true, characterData: true })
    })
    // REST is delayed so the socket refusal (not subject to the scenario) is seen first.
    await callMockControl(page, '/__mock/scenario', 'PUT', { latencyMs: 3000, failure: 'none' })
    await page.reload()

    await expect(page.getByTestId('realtime-state')).toHaveText('recusado')
    await expect(page.getByTestId('session-user')).toHaveText('visitante', { timeout: 15_000 })
    await expect(page.getByTestId('realtime-identity')).toHaveText('anônima')
    const identities = await page.evaluate(() => (window as unknown as { __kurioIdentities: string[] }).__kurioIdentities)
    expect(identities).not.toContain(ANA.id)
    const state = await callMockControl<MockConnections>(page, '/__mock/socket/connections')
    expect(state.connections.every((connection) => connection.userId === null)).toBe(true)
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull()
  })

  test('private events reach only their owner, even if the server broadcasts them', async ({ page }) => {
    await login(page, BRUNO)
    await openProfileFromHeader(page)
    await expect(page.getByTestId('realtime-identity')).toHaveText(BRUNO.id)

    // Simulated routing bug: Ana's private event is broadcast to every connection.
    const leaked = await callMockControl<{ delivered: number }>(page, `/__mock/users/${ANA.id}/profile`, 'POST', {
      displayName: 'Ana Vazada',
      delivery: 'broadcast',
    })
    expect(leaked.delivered).toBe(1)
    await expect(page.getByTestId('realtime-events-ignored')).toHaveText('1')
    await expect(page.getByTestId('realtime-events-applied')).toHaveText('0')
    await expect(page.getByText('Ana Vazada')).toHaveCount(0)

    // Bruno's own change made elsewhere arrives live.
    const own = await callMockControl<{ delivered: number }>(page, `/__mock/users/${BRUNO.id}/profile`, 'POST', {
      displayName: 'Bruno em Tempo Real',
      delivery: 'owner',
    })
    expect(own.delivered).toBe(1)
    await expect(page.getByTestId('profile-display-name')).toHaveText('Bruno em Tempo Real')
    await expect(page.getByTestId('realtime-events-applied')).toHaveText('1')
  })
})
