import { useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { displayNameSchema, type AccountProfile } from '@/contracts/account'
import { useAuthenticatedUser } from '@/features/auth/authenticated-user'
import { errorMessage } from '@/shared/forms/form-errors'
import { TextField } from '@/shared/forms/fields'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { clearDraft, readDraft, writeDraft } from '@/shared/session/drafts'
import { useProfile, useUpdateProfile } from './queries'

const DISPLAY_NAME_DRAFT = 'profile.displayName'

/**
 * Provisional profile screen (the Figma screen lands in F5). It already reads and
 * writes private data through the API, which the session isolation tests rely on.
 */
export function ProfilePage() {
  const user = useAuthenticatedUser()
  const profile = useProfile(user.id)

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-12">
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
    </section>
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
    <>
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
        <dt className="text-text-secondary">Apelido da carteira</dt>
        <dd className="text-cream">{profile.walletNickname ?? '—'}</dd>
      </dl>

      <form noValidate onSubmit={handleSubmit} className="flex max-w-sm flex-col gap-3">
        <h2 className="text-title-20 font-bold text-cream">Alterar nome de exibição</h2>
        {showRestored ? (
          <p role="status" className="text-caption-13 text-amber">
            Restauramos a alteração que você não chegou a salvar.
          </p>
        ) : null}
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
          }}
          error={error}
          inputRef={inputRef}
        />
        <Button
          type="submit"
          disabled={update.isPending}
          aria-busy={update.isPending}
          className="h-10 rounded-[5px] bg-brand text-body-14 font-bold text-ink hover:bg-brand-accent"
        >
          {update.isPending ? 'Salvando…' : 'Salvar nome'}
        </Button>
      </form>
    </>
  )
}
