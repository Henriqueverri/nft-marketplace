import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { loginRequestSchema } from '@/contracts/auth'
import { cn } from '@/lib/utils'
import { ApiError } from '@/shared/api/errors'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import {
  errorMessage,
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  firstInvalidField,
  type FieldErrors,
} from '@/shared/forms/form-errors'
import { useLogin } from '../queries'
import { FormAlert, PasswordField, TextField, type FieldVariant } from '@/shared/forms/fields'
import { SocialLogin } from './SocialLogin'

type LoginField = 'email' | 'password'
const FIELDS: readonly LoginField[] = ['email', 'password']
const FIELD_IDS: Record<LoginField, string> = { email: 'login-email', password: 'login-password' }

function fieldInput(field: LoginField) {
  return document.getElementById(FIELD_IDS[field]) as HTMLInputElement | null
}

interface LoginFormProps {
  variant: FieldVariant
  redirect: string
  expired: boolean
}

export function LoginForm({ variant, redirect, expired }: LoginFormProps) {
  const [values, setValues] = useState({ email: '', password: '' })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const login = useLogin()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const isDialog = variant === 'dialog'

  function showErrors(errors: FieldErrors<LoginField>) {
    setFieldErrors(errors)
    const first = firstInvalidField(FIELDS, errors)
    if (first) fieldInput(first)?.focus()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const parsed = loginRequestSchema.safeParse(values)
    if (!parsed.success) return showErrors(fieldErrorsFromZod(parsed.error))
    setFieldErrors({})

    login.mutate(parsed.data, {
      onSuccess: async (session) => {
        await navigate({ href: redirect, replace: true })
        announce(`Bem-vindo de volta, ${session.user.displayName}.`)
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
          return showErrors(fieldErrorsFromApi(error, FIELDS))
        }
        setFormError(errorMessage(error))
        if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') fieldInput('password')?.select()
      },
    })
  }

  function update(field: LoginField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col" aria-describedby={expired ? 'login-expired' : undefined}>
      <div className={cn('flex flex-col gap-3', isDialog ? 'px-20 pt-6' : '')}>
        {expired ? (
          <p id="login-expired" role="status" className="text-center text-caption-13 text-amber">
            Sua sessão expirou. Entre novamente para continuar de onde parou.
          </p>
        ) : null}
        <FormAlert message={formError} />
        <TextField
          id={FIELD_IDS.email}
          label="E-mail"
          variant={variant}
          type="email"
          autoComplete="email"
          placeholder="contato@email.com"
          value={values.email}
          onChange={(event) => update('email', event.target.value)}
          error={fieldErrors.email}
        />
        <PasswordField
          id={FIELD_IDS.password}
          label="Senha"
          toggleLabel="Mostrar senha"
          variant={variant}
          autoComplete="current-password"
          placeholder="Senha"
          value={values.password}
          onChange={(event) => update('password', event.target.value)}
          error={fieldErrors.password}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setNotice('Recuperação de senha indisponível na demonstração.')}
            className="rounded-[3px] text-body-14 leading-4 text-brand-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Esqueceu a senha?
          </button>
        </div>
      </div>

      <div className={isDialog ? 'px-20 pt-6' : 'pt-10'}>
        <Button
          type="submit"
          disabled={login.isPending}
          aria-busy={login.isPending}
          className={cn(
            'w-full bg-brand text-body-16 leading-4 font-bold text-ink hover:bg-brand-accent',
            isDialog ? 'h-[45px] rounded-[5px]' : 'h-[60px] rounded-[10px]',
          )}
        >
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </Button>
      </div>

      <div className={isDialog ? 'pt-6' : 'pt-10'}>
        <SocialLogin
          gapClass="gap-3"
          sidePaddingClass={isDialog ? 'px-20' : ''}
          onUnavailable={setNotice}
        />
      </div>

      <p role="status" className="min-h-4 pt-3 text-center text-caption-13 text-text-secondary">
        {notice}
      </p>

      {isDialog ? null : (
        <p className="pt-6 text-center text-body-15 text-text-secondary">
          Novo na Kurio?{' '}
          <Link to="/signup" search={{ redirect }} className="underline underline-offset-4 hover:text-brand-accent">
            Crie uma conta
          </Link>
        </p>
      )}
    </form>
  )
}
