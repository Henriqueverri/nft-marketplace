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
  const response = page.waitForResponse(
    (candidate) => candidate.url().endsWith('/api/auth/login') && candidate.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await response
}

/** Signs in from /login and waits for the session to be shown in the demo panel. */
export async function login(page: Page, account: { email: string; password: string; username?: string }, path = '/login') {
  await page.goto(path)
  await fillLogin(page, account.email, account.password)
  if (account.username) await expect(page.getByTestId('session-user')).toHaveText(`@${account.username}`)
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page.getByTestId('session-user')).toHaveText('visitante')
}
