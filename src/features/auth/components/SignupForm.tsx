import { Link, useNavigate } from '@tanstack/react-router'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { signupFormSchema } from '@/contracts/auth'
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
import { useSignup } from '../queries'
import { FormAlert, PasswordField, TextField, type FieldVariant } from '@/shared/forms/fields'
import { SocialLogin } from './SocialLogin'

type SignupField = 'username' | 'email' | 'password' | 'confirmPassword'
const FIELDS: readonly SignupField[] = ['username', 'email', 'password', 'confirmPassword']
const FIELD_IDS: Record<SignupField, string> = {
  username: 'signup-username',
  email: 'signup-email',
  password: 'signup-password',
  confirmPassword: 'signup-confirm-password',
}

interface SignupFormProps {
  variant: FieldVariant
  redirect: string
}

export function SignupForm({ variant, redirect }: SignupFormProps) {
  const [values, setValues] = useState<Record<SignupField, string>>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignupField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const signup = useSignup()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const isDialog = variant === 'dialog'

  function showErrors(errors: FieldErrors<SignupField>) {
    setFieldErrors(errors)
    const first = firstInvalidField(FIELDS, errors)
    if (first) document.getElementById(FIELD_IDS[first])?.focus()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const parsed = signupFormSchema.safeParse(values)
    if (!parsed.success) return showErrors(fieldErrorsFromZod(parsed.error))
    setFieldErrors({})

    const { username, email, password } = parsed.data
    signup.mutate({ username, email, password }, {
      onSuccess: async (session) => {
        await navigate({ href: redirect, replace: true })
        announce(`Conta criada. Boas-vindas, ${session.user.displayName}.`)
      },
      onError: (error) => {
        if (error instanceof ApiError) {
          const apiFieldErrors = fieldErrorsFromApi(error, FIELDS)
          if (firstInvalidField(FIELDS, apiFieldErrors)) return showErrors(apiFieldErrors)
        }
        setFormError(errorMessage(error))
      },
    })
  }

  function update(field: SignupField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }))
  }

  const common = (field: SignupField) => ({
    variant,
    value: values[field],
    onChange: (event: ChangeEvent<HTMLInputElement>) => update(field, event.target.value),
    error: fieldErrors[field],
    id: FIELD_IDS[field],
  })

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col">
      <div className={cn('flex flex-col gap-3', isDialog ? 'px-20 pt-6' : '')}>
        <FormAlert message={formError} />
        <TextField
          label="Nome de usuário"
          autoComplete="username"
          placeholder="Nome de usuário"
          inputClassName={isDialog ? undefined : 'text-center'}
          {...common('username')}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="Digite seu e-mail"
          {...common('email')}
        />
        <PasswordField
          label="Senha"
          toggleLabel="Mostrar senha"
          autoComplete="new-password"
          placeholder="Senha"
          aria-description="Mínimo de 8 caracteres, com letras e números."
          {...common('password')}
        />
        <TextField
          label="Confirmar senha"
          type="password"
          autoComplete="new-password"
          placeholder="Confirmar senha"
          {...common('confirmPassword')}
        />
      </div>

      <div className={isDialog ? 'px-20 pt-6' : 'pt-10'}>
        <Button
          type="submit"
          disabled={signup.isPending}
          aria-busy={signup.isPending}
          className={cn(
            'w-full bg-brand text-body-16 leading-4 font-bold text-ink hover:bg-brand-accent',
            isDialog ? 'h-[45px] rounded-[5px]' : 'h-[60px] rounded-[10px]',
          )}
        >
          {signup.isPending ? 'Criando…' : isDialog ? 'Criar conta' : 'Criar perfil'}
        </Button>
      </div>

      <div className={isDialog ? 'pt-6' : 'pt-10'}>
        <SocialLogin gapClass="gap-4" sidePaddingClass={isDialog ? 'px-20' : ''} onUnavailable={setNotice} />
      </div>

      <p role="status" className="min-h-4 pt-3 text-center text-caption-13 text-text-secondary">
        {notice}
      </p>

      {isDialog ? null : (
        <p className="pt-6 text-center text-body-15 text-text-secondary">
          Já tem uma conta?{' '}
          <Link to="/login" search={{ redirect }} className="underline underline-offset-4 hover:text-brand-accent">
            Entre
          </Link>
        </p>
      )}
    </form>
  )
}
