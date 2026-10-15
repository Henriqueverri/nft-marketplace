import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  upsertWalletRequestSchema,
  type Wallet,
  type WalletProvider,
  type WalletSlot,
} from '@/contracts/wallets'
import type { NetworkId } from '@/contracts/catalog'
import { AccountShell } from '@/features/account/AccountShell'
import { useAuthenticatedUser } from '@/features/auth/authenticated-user'
import { ApiError } from '@/shared/api/errors'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import {
  errorMessage,
  fieldErrorsFromApi,
  fieldErrorsFromZod,
  firstInvalidField,
  type FieldErrors,
} from '@/shared/forms/form-errors'
import { FormAlert, TextField } from '@/shared/forms/fields'
import { useUpsertWallet, useWallets } from '../queries'

type WalletField = 'displayName' | 'nickname' | 'networkId' | 'address' | 'provider' | 'ensName' | 'sameAsPrimary'
type WalletValues = Record<Exclude<WalletField, 'sameAsPrimary'>, string>
const FIELDS: readonly WalletField[] = [
  'displayName',
  'nickname',
  'networkId',
  'address',
  'provider',
  'ensName',
  'sameAsPrimary',
]
const NETWORKS: { id: NetworkId; label: string }[] = [
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'solana', label: 'Solana' },
]
const PROVIDERS: { id: WalletProvider; label: string }[] = [
  { id: 'metamask', label: 'MetaMask' },
  { id: 'walletconnect', label: 'WalletConnect' },
  { id: 'coinbase', label: 'Coinbase Wallet' },
  { id: 'phantom', label: 'Phantom' },
]

export function WalletsPage() {
  const user = useAuthenticatedUser()
  const wallets = useWallets(user.id)

  return (
    <AccountShell>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-heading-28 font-bold text-cream">Carteiras</h1>
          <p className="mt-2 text-body-14 text-text-secondary">
            Essas carteiras ficam disponíveis para seleção no pagamento.
          </p>
        </div>
        {wallets.isPending ? (
          <p role="status" className="text-body-14 text-text-secondary">
            Carregando carteiras…
          </p>
        ) : wallets.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-body-14 text-coral">{errorMessage(wallets.error)}</p>
            <Button type="button" variant="outline" onClick={() => void wallets.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <div className="flex max-w-2xl flex-col gap-6">
            <WalletForm
              key={`primary-${wallets.data.find((wallet) => wallet.slot === 'primary')?.id ?? 'new'}`}
              slot="primary"
              wallet={wallets.data.find((wallet) => wallet.slot === 'primary')}
              primary={undefined}
              userId={user.id}
            />
            <WalletForm
              key={`secondary-${wallets.data.find((wallet) => wallet.slot === 'secondary')?.id ?? 'new'}`}
              slot="secondary"
              wallet={wallets.data.find((wallet) => wallet.slot === 'secondary')}
              primary={wallets.data.find((wallet) => wallet.slot === 'primary')}
              userId={user.id}
            />
          </div>
        )}
      </div>
    </AccountShell>
  )
}

function valuesOf(wallet?: Wallet): WalletValues {
  return {
    displayName: wallet?.displayName ?? '',
    nickname: wallet?.nickname ?? '',
    networkId: wallet?.networkId ?? 'ethereum',
    address: wallet?.address ?? '',
    provider: wallet?.provider ?? 'metamask',
    ensName: wallet?.ensName ?? '',
  }
}

function sameWalletData(wallet: Wallet | undefined, primary: Wallet | undefined) {
  if (!wallet || !primary) return false
  return (
    wallet.displayName === primary.displayName &&
    wallet.nickname === primary.nickname &&
    wallet.networkId === primary.networkId &&
    wallet.address === primary.address &&
    wallet.provider === primary.provider &&
    wallet.ensName === primary.ensName
  )
}

function WalletForm({
  slot,
  wallet,
  primary,
  userId,
}: {
  slot: WalletSlot
  wallet?: Wallet
  primary?: Wallet
  userId: string
}) {
  const [values, setValues] = useState<WalletValues>(() => valuesOf(wallet))
  const [sameAsPrimary, setSameAsPrimary] = useState(() => slot === 'secondary' && sameWalletData(wallet, primary))
  const [errors, setErrors] = useState<FieldErrors<WalletField>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const save = useUpsertWallet(userId)
  const announce = useAnnounce()
  const prefix = `wallet-${slot}`

  function showErrors(next: FieldErrors<WalletField>) {
    setErrors(next)
    const first = firstInvalidField(FIELDS, next)
    if (first) document.getElementById(`${prefix}-${first}`)?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    const body =
      slot === 'secondary' && sameAsPrimary
        ? { sameAsPrimary: true as const }
        : {
            displayName: values.displayName,
            nickname: values.nickname,
            networkId: values.networkId,
            address: values.address,
            provider: values.provider,
            ensName: values.ensName,
            sameAsPrimary: false as const,
          }
    const parsed = upsertWalletRequestSchema.safeParse(body)
    if (!parsed.success) return showErrors(fieldErrorsFromZod(parsed.error))
    setErrors({})
    save.mutate(
      { slot, body: parsed.data },
      {
        onSuccess: () => announce(`Carteira ${slot === 'primary' ? 'principal' : 'secundária'} salva.`),
        onError: (cause) => {
          if (cause instanceof ApiError) {
            const apiErrors = fieldErrorsFromApi(cause, FIELDS)
            if (firstInvalidField(FIELDS, apiErrors)) return showErrors(apiErrors)
          }
          setFormError(errorMessage(cause))
        },
      },
    )
  }

  function update(field: keyof WalletValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4 rounded-[10px] bg-surface-card p-4 md:p-6">
      <h2 className="text-title-20 font-bold text-cream">
        Carteira {slot === 'primary' ? 'principal' : 'secundária'}
      </h2>
      <FormAlert message={formError} />
      {slot === 'secondary' ? (
        <div>
          <label className="flex items-center gap-3 text-body-14 text-cream">
            <input
              id={`${prefix}-sameAsPrimary`}
              type="checkbox"
              checked={sameAsPrimary}
              disabled={!primary || save.isPending}
              aria-describedby={errors.sameAsPrimary ? `${prefix}-sameAsPrimary-error` : undefined}
              onChange={(event) => {
                setSameAsPrimary(event.target.checked)
                setErrors((current) => ({ ...current, sameAsPrimary: undefined }))
              }}
              className="size-4 accent-brand"
            />
            Igual à principal
          </label>
          {!primary ? <p className="mt-1 text-caption-12 text-text-secondary">Cadastre a principal primeiro.</p> : null}
          {errors.sameAsPrimary ? (
            <p id={`${prefix}-sameAsPrimary-error`} className="mt-1 text-caption-12 text-coral">
              {errors.sameAsPrimary}
            </p>
          ) : null}
        </div>
      ) : null}

      <fieldset disabled={sameAsPrimary || save.isPending} className="grid gap-4 disabled:opacity-60 md:grid-cols-2">
        <WalletTextField prefix={prefix} field="displayName" label="Nome do titular" value={values.displayName} error={errors.displayName} onChange={update} />
        <WalletTextField prefix={prefix} field="nickname" label="Apelido" value={values.nickname} error={errors.nickname} onChange={update} />
        <SelectField
          id={`${prefix}-networkId`}
          label="Rede"
          value={values.networkId}
          error={errors.networkId}
          onChange={(value) => update('networkId', value)}
          options={NETWORKS}
        />
        <SelectField
          id={`${prefix}-provider`}
          label="Provedor"
          value={values.provider}
          error={errors.provider}
          onChange={(value) => update('provider', value)}
          options={PROVIDERS}
        />
        <div className="md:col-span-2">
          <WalletTextField prefix={prefix} field="address" label="Endereço" value={values.address} error={errors.address} onChange={update} />
        </div>
        <div className="md:col-span-2">
          <WalletTextField prefix={prefix} field="ensName" label="ENS (opcional)" value={values.ensName} error={errors.ensName} onChange={update} />
        </div>
      </fieldset>
      <Button type="submit" disabled={save.isPending} className="h-10 self-start bg-brand px-5 font-bold text-ink">
        {save.isPending ? 'Salvando…' : `Salvar carteira ${slot === 'primary' ? 'principal' : 'secundária'}`}
      </Button>
    </form>
  )
}

function WalletTextField({
  prefix,
  field,
  label,
  value,
  error,
  onChange,
}: {
  prefix: string
  field: keyof WalletValues
  label: string
  value: string
  error?: string
  onChange: (field: keyof WalletValues, value: string) => void
}) {
  return (
    <div>
      <span aria-hidden="true" className="mb-1.5 block text-caption-13 text-text-secondary">
        {label}
      </span>
      <TextField
        id={`${prefix}-${field}`}
        label={`${label} da carteira ${prefix.endsWith('primary') ? 'principal' : 'secundária'}`}
        variant="dialog"
        value={value}
        error={error}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </div>
  )
}

function SelectField({
  id,
  label,
  value,
  error,
  onChange,
  options,
}: {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  options: { id: string; label: string }[]
}) {
  const errorId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-caption-13 text-text-secondary">
        {label}
      </label>
      <select
        id={id}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-[5px] border border-border-field bg-surface-card px-3 text-body-14 text-cream outline-none focus:border-brand focus:ring-2 focus:ring-ring/40"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="mt-1.5 text-caption-12 text-coral">
          {error}
        </p>
      ) : null}
    </div>
  )
}
