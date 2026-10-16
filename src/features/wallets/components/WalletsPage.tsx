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
import {
  AccountEnsField,
  AccountSelectField,
  AccountTextField,
  FormAlert,
} from '@/shared/forms/fields'
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
      <div className="flex w-full max-w-[862px] flex-col gap-8">
        <h1 className="sr-only">Carteiras</h1>
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
          <>
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
          </>
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
  const slotLabel = slot === 'primary' ? 'principal' : 'secundária'
  const showSecondaryEmptyHint = slot === 'secondary' && !wallet && !sameAsPrimary

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
        onSuccess: () => announce(`Carteira ${slotLabel} salva.`),
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

  function focusFirstField() {
    document.getElementById(`${prefix}-displayName`)?.focus()
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-[17px] font-bold leading-4 text-cream">Carteira {slotLabel}</h2>
          <div className="flex shrink-0 flex-wrap items-center gap-6">
            {slot === 'secondary' ? (
              <label className="flex items-center gap-2 text-body-14 text-cream">
                <input
                  id={`${prefix}-sameAsPrimary`}
                  type="checkbox"
                  checked={sameAsPrimary}
                  disabled={!primary || save.isPending}
                  aria-label="Igual à principal"
                  aria-describedby={errors.sameAsPrimary ? `${prefix}-sameAsPrimary-error` : undefined}
                  onChange={(event) => {
                    setSameAsPrimary(event.target.checked)
                    setErrors((current) => ({ ...current, sameAsPrimary: undefined }))
                  }}
                  className="size-4 rounded-full accent-brand"
                />
                <span aria-hidden>Igual à carteira principal</span>
              </label>
            ) : null}
            <button
              type="button"
              className="text-body-16 font-medium text-brand-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                if (slot === 'secondary' && sameAsPrimary) setSameAsPrimary(false)
                focusFirstField()
              }}
            >
              Adicionar
            </button>
          </div>
        </div>
        {slot === 'primary' ? (
          <p className="text-body-14 leading-[15px] text-text-secondary">
            Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.
          </p>
        ) : showSecondaryEmptyHint ? (
          <p className="text-body-14 leading-[15px] text-text-secondary">
            Você ainda não adicionou uma carteira secundária.
          </p>
        ) : null}
        {slot === 'secondary' && !primary ? (
          <p className="text-caption-12 text-text-secondary">Cadastre a principal primeiro.</p>
        ) : null}
        {errors.sameAsPrimary ? (
          <p id={`${prefix}-sameAsPrimary-error`} className="text-caption-12 text-coral">
            {errors.sameAsPrimary}
          </p>
        ) : null}
      </div>

      <FormAlert message={formError} />

      <fieldset
        disabled={sameAsPrimary || save.isPending}
        className="grid gap-6 disabled:opacity-60 md:grid-cols-2 md:gap-x-7"
      >
        <AccountTextField
          id={`${prefix}-displayName`}
          visibleLabel="Nome de exibição"
          label={`Nome de exibição da carteira ${slotLabel}`}
          required
          value={values.displayName}
          error={errors.displayName}
          onChange={(event) => update('displayName', event.target.value)}
        />
        <AccountTextField
          id={`${prefix}-nickname`}
          visibleLabel="Apelido da carteira"
          label={`Apelido da carteira ${slotLabel}`}
          required
          value={values.nickname}
          error={errors.nickname}
          onChange={(event) => update('nickname', event.target.value)}
        />
        <AccountSelectField
          id={`${prefix}-networkId`}
          visibleLabel="Rede"
          label={`Rede da carteira ${slotLabel}`}
          required
          value={values.networkId}
          error={errors.networkId}
          onChange={(value) => update('networkId', value)}
          options={NETWORKS}
        />
        <AccountSelectField
          id={`${prefix}-provider`}
          visibleLabel="Tipo de carteira"
          label={`Provedor da carteira ${slotLabel}`}
          required
          value={values.provider}
          error={errors.provider}
          onChange={(value) => update('provider', value)}
          options={PROVIDERS}
        />
        <AccountTextField
          id={`${prefix}-address`}
          visibleLabel="Endereço da carteira"
          label={`Endereço da carteira ${slotLabel}`}
          required
          placeholder="Endereço 0x da carteira"
          value={values.address}
          error={errors.address}
          onChange={(event) => update('address', event.target.value)}
        />
        <AccountEnsField
          id={`${prefix}-ensName`}
          visibleLabel="Nome ENS"
          label={`ENS da carteira ${slotLabel}`}
          value={values.ensName}
          error={errors.ensName}
          placeholder="ENS ou carteira secundária (opcional)"
          onChange={(value) => update('ensName', value)}
        />
      </fieldset>

      <Button
        type="submit"
        disabled={save.isPending}
        className="h-10 min-w-[131px] self-start rounded-[3px] bg-brand px-3 text-body-14 font-bold text-ink hover:bg-brand-accent"
      >
        {save.isPending ? 'Salvando…' : `Salvar carteira ${slotLabel}`}
      </Button>
    </form>
  )
}
