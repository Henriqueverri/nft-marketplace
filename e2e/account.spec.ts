import { expect, test } from '@playwright/test'
import path from 'node:path'
import { ANA, BRUNO, fillLogin, login, logout } from './support/auth'
import { addFromDetail, VELVET_OPEN } from './support/cart'

test.describe('account @account', () => {
  test('profile validation and edits persist after refresh', async ({ page }) => {
    await login(page, ANA, '/login?redirect=/account/profile')
    await expect(page).toHaveURL(/\/account\/profile$/)

    const apiValidation = await page.evaluate(async () => {
      const response = await fetch('/api/me', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${JSON.parse(localStorage.getItem('kurio:session')!).token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName: 'x' }),
      })
      return { status: response.status, body: await response.json() }
    })
    expect(apiValidation).toMatchObject({
      status: 422,
      body: { error: { code: 'VALIDATION_FAILED', fieldErrors: { displayName: [expect.any(String)] } } },
    })

    const name = page.getByLabel('Nome de exibição')
    await name.fill('x')
    await page.getByRole('button', { name: 'Salvar nome' }).click()
    await expect(name).toBeFocused()
    await expect(name).toHaveAccessibleDescription('Use pelo menos 2 caracteres.')
    await expect(name).toHaveValue('x')

    await name.fill('Ana Curadora')
    await page.getByRole('button', { name: 'Salvar nome' }).click()
    await expect(page.getByTestId('profile-display-name')).toHaveText('Ana Curadora')
    await expect(page.getByTestId('header-user')).toHaveText('Ana Curadora')
    await page.reload()
    await expect(page.getByTestId('profile-display-name')).toHaveText('Ana Curadora')
    await expect(name).toHaveValue('Ana Curadora')
  })

  test('wrong current password is associated with its field and a new password works', async ({ page }) => {
    await login(page, ANA, '/login?redirect=/account/profile')
    const current = page.getByLabel('Senha atual', { exact: true })
    const next = page.getByLabel('Nova senha', { exact: true })
    const confirmation = page.getByLabel('Confirmar nova senha', { exact: true })

    await current.fill('senha-incorreta')
    await next.fill('nova-kurio-2027')
    await confirmation.fill('nova-kurio-2027')
    await page.getByRole('button', { name: 'Alterar senha' }).click()
    await expect(current).toBeFocused()
    await expect(current).toHaveAccessibleDescription('A senha atual está incorreta.')
    await expect(next).toHaveValue('nova-kurio-2027')
    await expect(confirmation).toHaveValue('nova-kurio-2027')

    await current.fill(ANA.password)
    await page.getByRole('button', { name: 'Alterar senha' }).click()
    await expect(page.getByTestId('announcer')).toContainText('Senha alterada com sucesso.')
    await expect(current).toHaveValue('')
    await logout(page)
    await page.getByRole('link', { name: 'Entrar' }).click()
    await fillLogin(page, ANA.email, 'nova-kurio-2027')
    await expect(page.getByTestId('session-user')).toHaveText(`@${ANA.username}`)
  })

  test('avatar is resized, persisted and removable', async ({ page }) => {
    await login(page, ANA, '/login?redirect=/account/profile')
    await page.getByLabel('Imagem PNG, JPEG ou WebP, até 5 MB').setInputFiles(
      path.resolve('src/assets/nfts/ape-sunglasses-960.webp'),
    )
    const preview = page.getByTestId('avatar-preview')
    await expect(preview).toBeVisible()
    const dimensions = await preview.evaluate((image: HTMLImageElement) => ({
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image.src,
    }))
    expect(Math.max(dimensions.width, dimensions.height)).toBe(256)
    expect(dimensions.source).toMatch(/^data:image\/webp;base64,/)

    await page.getByRole('button', { name: 'Salvar avatar' }).click()
    await expect(page.getByTestId('announcer')).toContainText('Avatar atualizado.')
    await page.reload()
    await expect(preview).toBeVisible()
    await page.getByRole('button', { name: 'Remover avatar' }).click()
    await expect(page.getByTestId('announcer')).toContainText('Avatar removido.')
    await page.reload()
    await expect(page.getByTestId('avatar-preview')).toHaveCount(0)
    await expect(page.getByLabel('Sem avatar')).toBeVisible()
  })

  test('wallet edits, secondary copy and checkout use the persisted wallet', async ({ page }, testInfo) => {
    await login(page, ANA, '/login?redirect=/account/wallets')
    const primaryNickname = page.getByLabel('Apelido da carteira principal')
    const primaryAddress = page.getByLabel('Endereço da carteira principal')
    await primaryNickname.fill('Carteira de compras')
    await primaryAddress.fill('0x1111111111111111111111111111111111111111')
    await page.getByRole('button', { name: 'Salvar carteira principal' }).click()
    await expect(page.getByTestId('announcer')).toContainText('Carteira principal salva.')

    const secondaryAddress = page.getByLabel('Endereço da carteira secundária')
    await secondaryAddress.fill('inválido')
    await page.getByRole('button', { name: 'Salvar carteira secundária' }).click()
    await expect(secondaryAddress).toBeFocused()
    await expect(secondaryAddress).toHaveAccessibleDescription('Informe um endereço EVM válido.')
    await expect(secondaryAddress).toHaveValue('inválido')

    await page.getByLabel('Igual à principal').check()
    await page.getByRole('button', { name: 'Salvar carteira secundária' }).click()
    await expect(page.getByTestId('announcer')).toContainText('Carteira secundária salva.')
    await page.reload()
    await expect(page.getByLabel('Igual à principal')).toBeChecked()
    await expect(page.getByLabel('Endereço da carteira secundária')).toBeDisabled()

    await addFromDetail(page, testInfo, VELVET_OPEN, 1)
    await page.getByRole('button', { name: 'Conectar e finalizar' }).click()
    await expect(page).toHaveURL(/\/checkout$/)
    await expect(page.getByRole('radio', { name: /Carteira de compras · Principal/ })).toBeChecked()
  })

  test('profile and wallets stay isolated between users', async ({ page }) => {
    await login(page, ANA, '/login?redirect=/account/profile')
    await page.getByLabel('Nome de exibição').fill('Ana Isolada')
    await page.getByRole('button', { name: 'Salvar nome' }).click()
    await page.getByRole('link', { name: 'Carteiras', exact: true }).click()
    await page.getByLabel('Apelido da carteira principal').fill('Segredo da Ana')
    await page.getByRole('button', { name: 'Salvar carteira principal' }).click()

    await logout(page)
    await page.getByRole('link', { name: 'Entrar' }).click()
    await fillLogin(page, BRUNO.email, BRUNO.password)
    await page.goto('/account/profile')
    await expect(page.getByTestId('profile-display-name')).toHaveText(BRUNO.displayName)
    await page.getByRole('link', { name: 'Carteiras', exact: true }).click()
    await expect(page.getByLabel('Apelido da carteira principal')).toHaveValue('Cofre do Bruno')
    await expect(page.getByText('Ana Isolada')).toHaveCount(0)
    await expect(page.getByText('Segredo da Ana')).toHaveCount(0)
  })
})
