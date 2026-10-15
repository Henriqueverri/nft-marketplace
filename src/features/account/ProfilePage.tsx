import { useRef, useState, type ChangeEvent, type FormEvent } from 'react'
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
import { FormAlert, PasswordField, TextField } from '@/shared/forms/fields'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { clearDraft, readDraft, writeDraft } from '@/shared/session/drafts'
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
        <h1 className="text-heading-28 font-bold text-cream">Perfil do colecionador</h1>
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

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <dl className="grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body-14">
        <dt className="text-text-secondary">Nome de exibição</dt>
        <dd data-testid="profile-display-name" className="text-cream">
          {profile.displayName}
        </dd>
        <dt className="text-text-secondary">Nome de usuário</dt>
        <dd data-testid="profile-username" className="text-cream">
          @{profile.username}
        </dd>
        <dt className="text-text-secondary">E-mail</dt>
        <dd data-testid="profile-email" className="text-cream">
          {profile.email}
        </dd>
      </dl>

      <AvatarForm profile={profile} />

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-[10px] bg-surface-card p-4 md:p-6">
        <h2 className="text-title-20 font-bold text-cream">Dados do perfil</h2>
        {showRestored ? (
          <p role="status" className="text-caption-13 text-amber">
            Restauramos a alteração que você não chegou a salvar.
          </p>
        ) : null}
        <span aria-hidden="true" className="text-caption-13 text-text-secondary">
          Nome de exibição
        </span>
        <TextField
          id="profile-display-name-input"
          label="Nome de exibição"
          variant="dialog"
          autoComplete="nickname"
          placeholder="Nome de exibição"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            writeDraft(profile.id, DISPLAY_NAME_DRAFT, event.target.value)
            if (error) setError(undefined)
          }}
          error={error}
          inputRef={inputRef}
        />
        <Button
          type="submit"
          disabled={update.isPending}
          aria-busy={update.isPending}
          className="h-10 self-start rounded-[5px] bg-brand px-5 text-body-14 font-bold text-ink hover:bg-brand-accent"
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
    <section aria-labelledby="avatar-title" className="rounded-[10px] bg-surface-card p-4 md:p-6">
      <h2 id="avatar-title" className="text-title-20 font-bold text-cream">
        Avatar
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        {preview ? (
          <img
            src={preview}
            alt="Pré-visualização do avatar"
            data-testid="avatar-preview"
            className="size-24 rounded-full object-cover"
          />
        ) : (
          <div aria-label="Sem avatar" className="flex size-24 items-center justify-center rounded-full bg-surface-raised text-heading-28 text-sand">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col gap-3">
          <label htmlFor="profile-avatar" className="text-caption-13 text-text-secondary">
            Imagem PNG, JPEG ou WebP, até 5 MB
          </label>
          <input
            ref={fileRef}
            id="profile-avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={processing || mutation.isPending}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'profile-avatar-error' : undefined}
            onChange={(event) => void choose(event)}
            className="max-w-full text-body-14 text-cream file:mr-3 file:rounded-[5px] file:border-0 file:bg-brand file:px-3 file:py-2 file:font-bold file:text-ink"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!changed || processing || mutation.isPending} onClick={() => save(preview)}>
              {processing ? 'Processando…' : mutation.isPending ? 'Salvando…' : 'Salvar avatar'}
            </Button>
            {(preview || profile.avatarUrl) && (
              <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => save(null)}>
                Remover avatar
              </Button>
            )}
          </div>
        </div>
      </div>
      {error ? (
        <p id="profile-avatar-error" role="alert" className="mt-3 text-caption-13 text-coral">
          {error}
        </p>
      ) : null}
    </section>
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
    <form noValidate onSubmit={submit} className="flex flex-col gap-3 rounded-[10px] bg-surface-card p-4 md:p-6">
      <h2 className="text-title-20 font-bold text-cream">Alterar senha</h2>
      <FormAlert message={formError} />
      <PasswordField
        id={PASSWORD_IDS.currentPassword}
        label="Senha atual"
        toggleLabel="Mostrar caracteres da senha"
        variant="dialog"
        autoComplete="current-password"
        placeholder="Senha atual"
        value={values.currentPassword}
        onChange={(event) => update('currentPassword', event.target.value)}
        error={errors.currentPassword}
      />
      <PasswordField
        id={PASSWORD_IDS.newPassword}
        label="Nova senha"
        toggleLabel="Mostrar caracteres da senha"
        variant="dialog"
        autoComplete="new-password"
        placeholder="Nova senha"
        value={values.newPassword}
        onChange={(event) => update('newPassword', event.target.value)}
        error={errors.newPassword}
      />
      <PasswordField
        id={PASSWORD_IDS.confirmPassword}
        label="Confirmar nova senha"
        toggleLabel="Mostrar caracteres da senha"
        variant="dialog"
        autoComplete="new-password"
        placeholder="Confirmar nova senha"
        value={values.confirmPassword}
        onChange={(event) => update('confirmPassword', event.target.value)}
        error={errors.confirmPassword}
      />
      <Button type="submit" disabled={change.isPending} className="h-10 self-start bg-brand px-5 font-bold text-ink">
        {change.isPending ? 'Alterando…' : 'Alterar senha'}
      </Button>
    </form>
  )
}
