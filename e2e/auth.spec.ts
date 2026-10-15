import { expect, test, type Page } from '@playwright/test'
import { ANA, authHeading, fillLogin, login, logout, signupButtonName } from './support/auth'
import { callMockControl, SESSION_STORAGE_KEY, type MockStateSummary } from './support/mock-control'

async function fillSignup(
  page: Page,
  values: { username: string; email: string; password: string; confirmPassword: string },
) {
  await page.getByLabel('Nome de usuário').fill(values.username)
  await page.getByLabel('E-mail').fill(values.email)
  await page.getByLabel('Senha', { exact: true }).fill(values.password)
  await page.getByLabel('Confirmar senha').fill(values.confirmPassword)
}

test.describe('auth @auth', () => {
  test('valid signup normalizes the e-mail, signs in and opens the private profile', async ({ page }, testInfo) => {
    await page.goto('/signup')
    await expect(page.getByRole('heading', { level: 1, name: authHeading('signup', testInfo) })).toBeVisible()
    await fillSignup(page, {
      username: 'carla.nova',
      email: '  Carla.Nova@Kurio.TEST ',
      password: 'colecao-2026',
      confirmPassword: 'colecao-2026',
    })
    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup'))
    await page.getByRole('button', { name: signupButtonName(testInfo), exact: true }).click()
    expect((await response).status()).toBe(201)

    await expect(page).toHaveURL((url) => url.pathname === '/')
    await expect(page.getByTestId('session-user')).toHaveText('@carla.nova')
    await expect(page.getByTestId('announcer')).toContainText('Conta criada')

    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page.getByTestId('profile-email')).toHaveText('carla.nova@kurio.test')
    await expect(page.getByTestId('profile-username')).toHaveText('@carla.nova')
  })

  test('invalid signup shows accessible field errors and creates nothing', async ({ page }, testInfo) => {
    await page.goto('/signup')
    const submit = page.getByRole('button', { name: signupButtonName(testInfo), exact: true })
    const username = page.getByLabel('Nome de usuário')
    const email = page.getByLabel('E-mail')
    const password = page.getByLabel('Senha', { exact: true })
    const confirm = page.getByLabel('Confirmar senha')

    await submit.click()
    await expect(username).toBeFocused()
    await expect(username).toHaveAttribute('aria-invalid', 'true')
    await expect(username).toHaveAccessibleDescription('Use pelo menos 3 caracteres.')
    await expect(email).toHaveAccessibleDescription('Informe um e-mail válido.')

    await fillSignup(page, { username: 'carla.nova', email: 'carla@kurio.test', password: 'curta1', confirmPassword: 'curta1' })
    await submit.click()
    await expect(password).toBeFocused()
    await expect(password).toHaveAccessibleDescription('A senha precisa ter pelo menos 8 caracteres.')

    await password.fill('semnumeros')
    await confirm.fill('semnumeros')
    await submit.click()
    await expect(password).toHaveAccessibleDescription('A senha precisa ter pelo menos um número.')

    await password.fill('valida-2026')
    await confirm.fill('diferente-2026')
    await submit.click()
    await expect(confirm).toBeFocused()
    await expect(confirm).toHaveAccessibleDescription('As senhas não coincidem.')

    await expect(page.getByTestId('session-user')).toHaveText('visitante')
    const state = await callMockControl<MockStateSummary>(page, '/__mock/state')
    expect(state.counts.users).toBe(2)
  })

  test('duplicate e-mail is refused by the API with 409 and a field error', async ({ page }, testInfo) => {
    await page.goto('/signup')
    await fillSignup(page, {
      username: 'outra.ana',
      email: ' ANA@Kurio.test ',
      password: 'colecao-2026',
      confirmPassword: 'colecao-2026',
    })
    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup'))
    await page.getByRole('button', { name: signupButtonName(testInfo), exact: true }).click()
    expect((await response).status()).toBe(409)

    const email = page.getByLabel('E-mail')
    await expect(email).toBeFocused()
    await expect(email).toHaveAccessibleDescription('Já existe uma conta com este e-mail.')
    await expect(page.getByTestId('session-user')).toHaveText('visitante')
    const state = await callMockControl<MockStateSummary>(page, '/__mock/state')
    expect(state.counts.users).toBe(2)
  })

  test('login refuses wrong credentials with the same message and accepts valid ones', async ({ page }) => {
    await page.goto('/login')

    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.getByLabel('E-mail')).toBeFocused()
    await expect(page.getByLabel('E-mail')).toHaveAccessibleDescription('Informe um e-mail válido.')

    await fillLogin(page, ANA.email, 'senha-errada-1')
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')

    await fillLogin(page, 'ninguem@kurio.test', 'senha-errada-1')
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await expect(page.getByTestId('session-user')).toHaveText('visitante')

    await fillLogin(page, ANA.email.toUpperCase(), ANA.password)
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await expect(page.getByTestId('session-user')).toHaveText(`@${ANA.username}`)
    await expect(page.getByTestId('header-user')).toHaveText(ANA.displayName)
  })

  test('session survives a refresh', async ({ page }) => {
    await login(page, ANA)
    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page.getByTestId('profile-email')).toHaveText(ANA.email)

    await page.reload()
    await expect(page).toHaveURL(/\/account\/profile$/)
    await expect(page.getByTestId('session-user')).toHaveText(`@${ANA.username}`)
    await expect(page.getByTestId('profile-email')).toHaveText(ANA.email)
  })

  test('logout revokes the session, clears private data and leaves the private area', async ({ page }) => {
    await login(page, ANA)
    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page.getByTestId('profile-email')).toHaveText(ANA.email)

    await logout(page)
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await expect(page.getByTestId('announcer')).toContainText('Você saiu da sua conta.')
    await expect(page.getByTestId('profile-email')).toHaveCount(0)
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull()

    const state = await callMockControl<MockStateSummary>(page, '/__mock/state')
    expect(state.counts.activeSessions).toBe(0)

    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/login')
    await expect(page.getByText(ANA.email)).toHaveCount(0)
  })

  test('an expired session gets a real 401, goes to login and resumes the draft afterwards', async ({ page }) => {
    await login(page, ANA)
    await page.getByRole('link', { name: 'Meu perfil' }).click()
    await expect(page.getByTestId('profile-email')).toHaveText(ANA.email)
    await page.getByLabel('Nome de exibição').fill('Ana rascunho')

    const unauthorized = page.waitForResponse((r) => r.url().endsWith('/api/auth/session') && r.status() === 401)
    await page.getByRole('button', { name: 'Expirar sessão' }).click()
    await unauthorized

    await expect(page).toHaveURL(
      (url) =>
        url.pathname === '/login' &&
        url.searchParams.get('reason') === 'expired' &&
        url.searchParams.get('redirect') === '/account/profile',
    )
    await expect(page.getByText('Sua sessão expirou.')).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), SESSION_STORAGE_KEY)).toBeNull()

    await fillLogin(page, ANA.email, ANA.password)
    await expect(page).toHaveURL(/\/account\/profile$/)
    await expect(page.getByLabel('Nome de exibição')).toHaveValue('Ana rascunho')
    await expect(page.getByText('Restauramos a alteração')).toBeVisible()
  })

  test('login returns to the requested private route', async ({ page }) => {
    await page.goto('/account/wallets')
    await expect(page).toHaveURL((url) => url.pathname === '/login')
    await fillLogin(page, ANA.email, ANA.password)
    await expect(page).toHaveURL(/\/account\/wallets$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Carteiras' })).toBeVisible()
  })

  for (const target of ['//evil.example/roubo', 'https://evil.example', '/\\evil.example']) {
    test(`redirect parameter cannot leave the site (${target})`, async ({ page, baseURL }) => {
      await page.goto(`/login?redirect=${encodeURIComponent(target)}`)
      await fillLogin(page, ANA.email, ANA.password)
      await expect(page.getByTestId('session-user')).toHaveText(`@${ANA.username}`)
      await expect(page).toHaveURL(`${baseURL}/`)
    })
  }

  test('private routes stay protected and signed-in users skip the auth screens', async ({ page }) => {
    await page.goto('/checkout')
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.searchParams.get('redirect') === '/checkout')
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento' })).toHaveCount(0)

    await fillLogin(page, ANA.email, ANA.password)
    await expect(page.getByRole('heading', { level: 1, name: 'Pagamento' })).toBeVisible()

    await page.goto('/login')
    await expect(page).toHaveURL((url) => url.pathname === '/')
  })
})
