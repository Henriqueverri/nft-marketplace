import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { ANA, fillLogin, login, logout, signupButtonName } from './support/auth'
import { callMockControl, DB_STORAGE_KEY, SESSION_STORAGE_KEY, type MockStateSummary } from './support/mock-control'

async function signup(page: Page, testInfo: TestInfo, account: { username: string; email: string; password: string }) {
  await page.goto('/signup')
  await page.getByLabel('Nome de usuário').fill(account.username)
  await page.getByLabel('E-mail').fill(account.email)
  await page.getByLabel('Senha', { exact: true }).fill(account.password)
  await page.getByLabel('Confirmar senha').fill(account.password)
  await page.getByRole('button', { name: signupButtonName(testInfo), exact: true }).click()
}

async function renameProfile(page: Page, displayName: string) {
  await page.getByRole('link', { name: 'Meu perfil' }).click()
  await page.getByLabel('Nome de exibição').fill(displayName)
  await page.getByRole('button', { name: 'Salvar nome' }).click()
  await expect(page.getByTestId('profile-display-name')).toHaveText(displayName)
}

async function applyScenario(page: Page, scenario: { latency?: string; failure: string }) {
  if (scenario.latency) await page.getByLabel('Latência').selectOption({ label: scenario.latency })
  await page.getByLabel('Falha da API').selectOption({ label: scenario.failure })
  await page.getByRole('button', { name: 'Aplicar cenário' }).click()
  await expect(page.getByTestId('scenario-current')).toContainText(scenario.failure)
}

/**
 * On desktop the auth modal makes the rest of the page inert (focus trap), so the
 * demo panel is used with the modal closed, as a visitor would.
 */
async function closeAuthDialogIfOpen(page: Page) {
  const dialog = page.getByRole('dialog')
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: 'Fechar' }).click()
    await expect(dialog).toHaveCount(0)
  }
}

async function openLoginFromHeader(page: Page) {
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrar' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar' })).toBeVisible()
}

const DIEGO = { username: 'diego.teste', email: 'diego@kurio.test', password: 'Segredo-Unico-2026x' }

test.describe('mock database and scenarios @mocks', () => {
  test('reset restores the seed, the default scenario and ends the session', async ({ page }, testInfo) => {
    await signup(page, testInfo, DIEGO)
    await expect(page.getByTestId('session-user')).toHaveText(`@${DIEGO.username}`)
    await logout(page)
    await login(page, ANA)
    await renameProfile(page, 'Ana Alterada')
    await applyScenario(page, { latency: '800 ms', failure: 'Nenhuma falha' })
    await expect(page.getByTestId('mock-users-count')).toHaveText('3')

    await page.getByRole('button', { name: 'Restaurar estado inicial' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await expect(page.getByTestId('session-user')).toHaveText('visitante')
    await expect(page.getByTestId('mock-users-count')).toHaveText('2')
    await expect(page.getByTestId('scenario-current')).toHaveText('100 ms · Nenhuma falha')
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull()

    await page.goto('/login')
    await fillLogin(page, DIEGO.email, DIEGO.password)
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await fillLogin(page, ANA.email, ANA.password)
    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page.getByTestId('profile-display-name')).toHaveText(ANA.displayName)
  })

  test('accounts and profile changes persist across refreshes', async ({ page }, testInfo) => {
    await signup(page, testInfo, DIEGO)
    await renameProfile(page, 'Diego Persistido')
    await page.reload()
    await expect(page.getByTestId('profile-display-name')).toHaveText('Diego Persistido')

    await logout(page)
    await page.reload()
    await login(page, { ...DIEGO, username: DIEGO.username })
    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page.getByTestId('profile-display-name')).toHaveText('Diego Persistido')
    await expect(page.getByTestId('profile-email')).toHaveText(DIEGO.email)
  })

  test('passwords and tokens are never stored or returned in clear', async ({ page }, testInfo) => {
    const signupResponse = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup'))
    await signup(page, testInfo, DIEGO)
    const body = (await (await signupResponse).json()) as { token: string; user: Record<string, unknown> }
    expect(Object.keys(body.user).sort()).toEqual(['avatarUrl', 'displayName', 'email', 'id', 'username'])
    await expect(page.getByTestId('session-user')).toHaveText(`@${DIEGO.username}`)

    const raw = await page.evaluate((key) => localStorage.getItem(key) ?? '', DB_STORAGE_KEY)
    expect(raw.length).toBeGreaterThan(0)
    for (const secret of [DIEGO.password, ANA.password, body.token]) expect(raw).not.toContain(secret)
    expect(raw).not.toMatch(/"password"/i)

    const db = JSON.parse(raw) as {
      users: { id: string; email: string }[]
      credentials: { userId: string; algorithm: string; iterations: number; salt: string; hash: string }[]
      sessions: { tokenHash: string }[]
    }
    const diego = db.users.find((user) => user.email === DIEGO.email)!
    const credential = db.credentials.find((item) => item.userId === diego.id)!
    expect(credential.algorithm).toBe('PBKDF2-SHA-256')
    expect(credential.iterations).toBe(600_000)
    expect(credential.salt.length).toBeGreaterThanOrEqual(16)
    expect(credential.hash).not.toBe(DIEGO.password)
    // Same password, different salt: two hashes never match.
    const saltCount = new Set(db.credentials.map((item) => item.salt)).size
    expect(saltCount).toBe(db.credentials.length)
    expect(db.sessions.every((session) => /^[0-9a-f]{64}$/.test(session.tokenHash))).toBe(true)

    const state = JSON.stringify(await callMockControl<MockStateSummary>(page, '/__mock/state'))
    for (const secret of [DIEGO.password, body.token, credential.hash, credential.salt]) {
      expect(state).not.toContain(secret)
    }
  })

  test('API failures from the scenario panel give visible feedback and recover', async ({ page }) => {
    await page.goto('/')
    await applyScenario(page, { failure: 'Erro interno (500)' })
    await openLoginFromHeader(page)
    await fillLogin(page, ANA.email, ANA.password)
    await expect(page.getByRole('alert')).toHaveText('Erro interno simulado pelo cenário de falha.')

    await closeAuthDialogIfOpen(page)
    await page.goto('/')
    await applyScenario(page, { failure: 'Sem rede' })
    await openLoginFromHeader(page)
    await fillLogin(page, ANA.email, ANA.password)
    await expect(page.getByRole('alert')).toHaveText('Sem conexão com o servidor. Verifique sua rede e tente novamente.')
    await expect(page.getByTestId('session-user')).toHaveText('visitante')

    await closeAuthDialogIfOpen(page)
    await page.goto('/')
    await applyScenario(page, { failure: 'Nenhuma falha' })
    await openLoginFromHeader(page)
    await fillLogin(page, ANA.email, ANA.password)
    await expect(page.getByTestId('session-user')).toHaveText(`@${ANA.username}`)

    // A private screen under an unavailable API shows the error and a retry.
    await applyScenario(page, { failure: 'Serviço indisponível (503)' })
    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page.getByRole('alert')).toContainText('Serviço temporariamente indisponível.', { timeout: 15_000 })
    await applyScenario(page, { failure: 'Nenhuma falha' })
    await page.getByRole('button', { name: 'Tentar novamente' }).click()
    await expect(page.getByTestId('profile-email')).toHaveText(ANA.email)
  })

  test('a full browser storage fails the signup visibly instead of faking success', async ({ page }, testInfo) => {
    await page.goto('/signup')
    await expect(page.getByTestId('storage-state')).toContainText('ok')
    await page.evaluate(() => {
      // Fill the origin quota, from big chunks down to a few characters.
      let index = 0
      for (let size = 1 << 20; size >= 8; size = Math.floor(size / 2)) {
        const chunk = 'x'.repeat(size)
        for (;;) {
          try {
            localStorage.setItem(`filler-${index++}`, chunk)
          } catch {
            break
          }
        }
      }
    })

    await page.getByLabel('Nome de usuário').fill(DIEGO.username)
    await page.getByLabel('E-mail').fill(DIEGO.email)
    await page.getByLabel('Senha', { exact: true }).fill(DIEGO.password)
    await page.getByLabel('Confirmar senha').fill(DIEGO.password)
    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup'))
    await page.getByRole('button', { name: signupButtonName(testInfo), exact: true }).click()
    expect((await response).status()).toBe(507)
    await expect(page.getByRole('alert')).toHaveText(
      'Não foi possível salvar: o armazenamento local do navegador está cheio.',
    )
    await expect(page.getByTestId('session-user')).toHaveText('visitante')

    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith('filler-')) localStorage.removeItem(key)
    })
    const state = await callMockControl<MockStateSummary>(page, '/__mock/state')
    expect(state.counts.users).toBe(2)
    expect(state.users.some((user) => user.email === DIEGO.email)).toBe(false)
  })

  for (const corruption of ['invalid JSON', 'broken integrity'] as const) {
    test(`a corrupted database (${corruption}) is reported, never silently reseeded`, async ({ page }) => {
      await page.goto('/login')
      await expect(page.getByTestId('storage-state')).toContainText('ok')
      await page.evaluate(
        ({ key, corruption }) => {
          if (corruption === 'invalid JSON') {
            localStorage.setItem(key, '{"schemaVersion":1,')
            return
          }
          const db = JSON.parse(localStorage.getItem(key)!) as { users: { id: string }[] }
          db.users.push({ ...db.users[0], id: 'usr_clone' })
          localStorage.setItem(key, JSON.stringify(db))
        },
        { key: DB_STORAGE_KEY, corruption },
      )
      await page.reload()
      await expect(page.getByTestId('storage-state')).toHaveText('corrompido')

      await fillLogin(page, ANA.email, ANA.password)
      await expect(page.getByRole('alert')).toHaveText(
        'Os dados da demonstração estão corrompidos. Restaure o estado inicial no painel de cenários.',
      )
      await expect(page.getByTestId('storage-state')).toHaveText('corrompido')

      await closeAuthDialogIfOpen(page)
      await page.getByRole('button', { name: 'Restaurar estado inicial' }).click()
      await expect(page.getByTestId('storage-state')).toContainText('ok')
      await login(page, ANA)
    })
  }
})
