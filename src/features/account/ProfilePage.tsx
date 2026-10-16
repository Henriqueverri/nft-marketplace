import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import avatarPlaceholder from '@/assets/icons/account/avatar-placeholder.svg'
import { Button } from '@/components/ui/button'
import { displayNameSchema, type AccountProfile } from '@/contracts/account'
import { changePasswordFormSchema } from '@/contracts/auth'
import { useAuthenticatedUser } from '@/features/auth/authenticated-user'
import { ApiError } from '@/shared/api/errors'
import {
  errorMessage,
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  firstInvalidField,
  type FieldErrors,
} from '@/shared/forms/form-errors'
import {
  AccountEnsField,
  AccountReadOnlyField,
  AccountTextField,
  FieldLabel,
  FormAlert,
  PasswordField,
} from '@/shared/forms/fields'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { clearDraft, readDraft, writeDraft } from '@/shared/session/drafts'
import { cn } from '@/lib/utils'
import { AccountShell } from './AccountShell'
import { resizeAvatar } from './avatar'
import { useChangePassword, useProfile, useUpdateAvatar, useUpdateProfile } from './queries'

const DISPLAY_NAME_DRAFT = 'profile.displayName'

export function ProfilePage() {
  const user = useAuthenticatedUser()
  const profile = useProfile(user.id)

  return (
    <AccountShell>
      <div className="flex flex-col gap-8">
        <h1 className="text-body-16 font-bold leading-4 text-cream max-md:sr-only">Perfil do colecionador</h1>
        {profile.isPending ? (
          <p role="status" className="text-body-14 text-text-secondary">
            Carregando perfil…
          </p>
        ) : profile.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-body-14 text-coral">{errorMessage(profile.error)}</p>
            <Button type="button" variant="outline" onClick={() => void profile.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <ProfileDetails key={profile.data.id} profile={profile.data} />
        )}
      </div>
    </AccountShell>
  )
}

function ProfileDetails({ profile }: { profile: AccountProfile }) {
  const [restoredDraft] = useState(() => readDraft(profile.id, DISPLAY_NAME_DRAFT))
  const [value, setValue] = useState(restoredDraft ?? profile.displayName)
  const [showRestored, setShowRestored] = useState(restoredDraft !== null)
  const [error, setError] = useState<string | undefined>()
  const inputRef = useRef<HTMLInputElement>(null)
  const update = useUpdateProfile(profile.id)
  const announce = useAnnounce()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = displayNameSchema.safeParse(value)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      inputRef.current?.focus()
      return
    }
    setError(undefined)
    update.mutate(
      { displayName: parsed.data },
      {
        onSuccess: () => {
          clearDraft(profile.id, DISPLAY_NAME_DRAFT)
          setShowRestored(false)
          announce('Nome de exibição atualizado.')
        },
        onError: (mutationError) => setError(errorMessage(mutationError)),
      },
    )
  }

  const ensLocal = profile.ensName?.replace(/\.eth$/i, '') ?? ''

  return (
    <div className="flex w-full max-w-[862px] flex-col gap-8">
      <dl className="sr-only">
        <dt>Nome de exibição</dt>
        <dd data-testid="profile-display-name">{profile.displayName}</dd>
        <dt>Nome de usuário</dt>
        <dd data-testid="profile-username">@{profile.username}</dd>
        <dt>E-mail</dt>
        <dd data-testid="profile-email">{profile.email}</dd>
      </dl>

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-6">
        {showRestored ? (
          <p role="status" className="text-caption-13 text-amber">
            Restauramos a alteração que você não chegou a salvar.
          </p>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2 md:gap-x-7">
          <AccountTextField
            id="profile-display-name-input"
            visibleLabel="Nome de exibição"
            label="Nome de exibição"
            required
            autoComplete="nickname"
            value={value}
            onChange={(event) => {
              setValue(event.target.value)
              writeDraft(profile.id, DISPLAY_NAME_DRAFT, event.target.value)
              if (error) setError(undefined)
            }}
            error={error}
            inputRef={inputRef}
          />
          <AccountReadOnlyField label="Nome de usuário" required value={profile.username} />
          <AccountReadOnlyField label="E-mail" required value={profile.email} />
          <AccountEnsField
            id="profile-ens"
            visibleLabel="Nome ENS"
            label="Nome ENS"
            required
            value={ensLocal}
            readOnly
          />
          <AccountReadOnlyField label="Apelido da carteira" required value={profile.walletNickname || '—'} />
          <AvatarForm profile={profile} />
        </div>

        <Button
          type="submit"
          disabled={update.isPending}
          aria-busy={update.isPending}
          className="h-10 w-[131px] self-start rounded-[3px] bg-brand px-0 text-body-14 font-bold text-ink hover:bg-brand-accent"
        >
          {update.isPending ? 'Salvando…' : 'Salvar nome'}
        </Button>
      </form>

      <PasswordForm />
    </div>
  )
}

function AvatarForm({ profile }: { profile: AccountProfile }) {
  const [preview, setPreview] = useState<string | null>(profile.avatarUrl)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const mutation = useUpdateAvatar(profile.id)
  const announce = useAnnounce()
  const changed = preview !== profile.avatarUrl

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setProcessing(true)
    setError(null)
    try {
      setPreview(await resizeAvatar(file))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível processar a imagem.')
      event.target.value = ''
      event.target.focus()
    } finally {
      setProcessing(false)
    }
  }

  function save(avatarUrl: string | null) {
    setError(null)
    mutation.mutate(
      { avatarUrl },
      {
        onSuccess: (updated) => {
          setPreview(updated.avatarUrl)
          if (fileRef.current) fileRef.current.value = ''
          announce(updated.avatarUrl ? 'Avatar atualizado.' : 'Avatar removido.')
        },
        onError: (cause) => setError(errorMessage(cause)),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      <FieldLabel>Avatar</FieldLabel>
      <div className="flex flex-wrap items-center gap-6">
        {preview ? (
          <img
            src={preview}
            alt="Pré-visualização do avatar"
            data-testid="avatar-preview"
            className="size-[50px] rounded-full object-cover"
          />
        ) : (
          <div
            aria-label="Sem avatar"
            className="flex size-[50px] items-center justify-center rounded-full border border-border-field bg-surface-raised"
          >
            <img src={avatarPlaceholder} alt="" aria-hidden className="size-6" />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-5">
          <input
            ref={fileRef}
            id="profile-avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={processing || mutation.isPending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'profile-avatar-error' : undefined}
            aria-label="Imagem PNG, JPEG ou WebP, até 5 MB"
            onChange={(event) => void choose(event)}
            className="sr-only"
          />
          <button
            type="button"
            disabled={processing || mutation.isPending}
            onClick={() => fileRef.current?.click()}
            className="flex h-10 w-[98px] items-center justify-center rounded-[3px] bg-brand text-body-14 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            Alterar
          </button>
          {(preview || profile.avatarUrl) && (
            <button
              type="button"
              aria-label="Remover avatar"
              disabled={mutation.isPending}
              onClick={() => save(null)}
              className="text-body-14 text-cream outline-none hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              Remover
            </button>
          )}
          <Button
            type="button"
            disabled={!changed || processing || mutation.isPending}
            onClick={() => save(preview)}
            className={cn(
              'h-10 rounded-[3px] bg-brand px-4 text-body-14 font-bold text-ink',
              !changed && 'sr-only',
            )}
          >
            {processing ? 'Processando…' : mutation.isPending ? 'Salvando…' : 'Salvar avatar'}
          </Button>
        </div>
      </div>
      {error ? (
        <p id="profile-avatar-error" role="alert" className="text-caption-13 text-coral">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type PasswordFieldName = 'currentPassword' | 'newPassword' | 'confirmPassword'
const PASSWORD_FIELDS: readonly PasswordFieldName[] = ['currentPassword', 'newPassword', 'confirmPassword']
const PASSWORD_IDS: Record<PasswordFieldName, string> = {
  currentPassword: 'profile-current-password',
  newPassword: 'profile-new-password',
  confirmPassword: 'profile-confirm-password',
}

function PasswordForm() {
  const [values, setValues] = useState<Record<PasswordFieldName, string>>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<FieldErrors<PasswordFieldName>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const change = useChangePassword()
  const announce = useAnnounce()

  function showErrors(next: FieldErrors<PasswordFieldName>) {
    setErrors(next)
    const first = firstInvalidField(PASSWORD_FIELDS, next)
    if (first) document.getElementById(PASSWORD_IDS[first])?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const parsed = changePasswordFormSchema.safeParse(values)
    if (!parsed.success) return showErrors(fieldErrorsFromZod(parsed.error))
    setErrors({})
    change.mutate(
      { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword },
      {
        onSuccess: () => {
          setValues({ currentPassword: '', newPassword: '', confirmPassword: '' })
          announce('Senha alterada com sucesso.')
        },
        onError: (cause) => {
          if (cause instanceof ApiError) {
            const fieldErrors = fieldErrorsFromApi(cause, PASSWORD_FIELDS)
            if (firstInvalidField(PASSWORD_FIELDS, fieldErrors)) return showErrors(fieldErrors)
          }
          setFormError(errorMessage(cause))
        },
      },
    )
  }

  function update(field: PasswordFieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  return (
    <form noValidate onSubmit={submit} className="flex max-w-[417px] flex-col gap-6">
      <h2 className="text-body-16 font-medium leading-4 text-cream">Alterar senha</h2>
      <FormAlert message={formError} />
      {(
        [
          ['currentPassword', 'Senha atual', 'current-password'],
          ['newPassword', 'Nova senha', 'new-password'],
          ['confirmPassword', 'Confirmar nova senha', 'new-password'],
        ] as const
      ).map(([field, fieldLabel, autoComplete]) => (
        <div key={field} className="flex flex-col gap-2.5">
          <FieldLabel htmlFor={PASSWORD_IDS[field]}>{fieldLabel}</FieldLabel>
          <PasswordField
            id={PASSWORD_IDS[field]}
            label={fieldLabel}
            toggleLabel="Mostrar caracteres da senha"
            variant="account"
            autoComplete={autoComplete}
            value={values[field]}
            onChange={(event) => update(field, event.target.value)}
            error={errors[field]}
            hideSrLabel
          />
        </div>
      ))}
      <Button
        type="submit"
        disabled={change.isPending}
        className="h-10 w-[131px] self-start rounded-[3px] bg-brand px-0 font-bold text-ink"
      >
        {change.isPending ? 'Alterando…' : 'Alterar senha'}
      </Button>
    </form>
  )
}
