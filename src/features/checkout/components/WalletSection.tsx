import type { Ref } from 'react'
import { networkIdSchema, type NetworkId } from '@/contracts/catalog'
import type { Wallet } from '@/contracts/wallets'
import { useConnectWallet, useDisconnectWallet, useWalletConnection } from '@/features/wallets/queries'
import { cn } from '@/lib/utils'
import { ApiError } from '@/shared/api/errors'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { errorMessage } from '@/shared/forms/form-errors'
import { focusRing, NETWORK_NAMES, SLOT_NAMES } from './checkout-ui'

const optionClass =
  'flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-field bg-surface-card p-3 has-[:checked]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50'

/**
 * Network, then a registered wallet of that network (Figma mobile "Pagamento com
 * carteira": Principal / Reserva), then the simulated connection of the wallet app.
 * A network without a registered wallet cannot be chosen: the order would be refused.
 */
export function WalletSection({
  userId,
  wallets,
  networkId,
  walletId,
  onNetworkChange,
  onWalletChange,
  networkError,
  walletError,
  networkRef,
  walletRef,
}: {
  userId: string
  wallets: Wallet[]
  networkId: NetworkId | null
  walletId: string | null
  onNetworkChange: (networkId: NetworkId) => void
  onWalletChange: (walletId: string) => void
  networkError?: string
  walletError?: string
  networkRef: Ref<HTMLInputElement>
  walletRef: Ref<HTMLInputElement>
}) {
  const ofNetwork = wallets.filter((wallet) => wallet.networkId === networkId)
  const firstNetwork = networkIdSchema.options.find((id) => wallets.some((wallet) => wallet.networkId === id))

  return (
    <>
      <fieldset aria-describedby={networkError ? 'checkout-network-error' : undefined} className="flex flex-col gap-3">
        <legend className="mb-3 text-body-16 font-bold text-cream">Rede</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {networkIdSchema.options.map((id) => {
            const available = wallets.some((wallet) => wallet.networkId === id)
            return (
              <label key={id} className={optionClass}>
                <input
                  ref={id === firstNetwork ? networkRef : undefined}
                  type="radio"
                  name="checkout-network"
                  value={id}
                  checked={networkId === id}
                  disabled={!available}
                  onChange={() => onNetworkChange(id)}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span className="flex flex-col">
                  <span className="text-body-14 font-bold text-cream">{NETWORK_NAMES[id]}</span>
                  {available ? null : <span className="text-caption-12 text-text-secondary">Nenhuma carteira cadastrada</span>}
                </span>
              </label>
            )
          })}
        </div>
        {networkError ? (
          <p id="checkout-network-error" className="text-caption-12 text-coral">
            {networkError}
          </p>
        ) : null}
      </fieldset>

      <fieldset aria-describedby={walletError ? 'checkout-wallet-error' : undefined} className="flex flex-col gap-3">
        <legend className="mb-3 text-body-16 font-bold text-cream">Carteira</legend>
        {networkId === null ? (
          <p className="text-body-14 text-text-secondary">Escolha a rede para ver as carteiras compatíveis.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {ofNetwork.map((wallet, index) => (
              <label key={wallet.id} className={optionClass}>
                <input
                  ref={index === 0 ? walletRef : undefined}
                  type="radio"
                  name="checkout-wallet"
                  value={wallet.id}
                  checked={walletId === wallet.id}
                  onChange={() => onWalletChange(wallet.id)}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-body-14 font-bold text-cream">
                    {wallet.nickname} <span className="font-normal text-text-secondary">· {SLOT_NAMES[wallet.slot]}</span>
                  </span>
                  <span className="truncate text-caption-12 text-text-secondary">{wallet.ensName ?? wallet.address}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        {walletId ? <WalletConnectionControl userId={userId} walletId={walletId} /> : null}
        {walletError ? (
          <p id="checkout-wallet-error" className="text-caption-12 text-coral">
            {walletError}
          </p>
        ) : null}
      </fieldset>
    </>
  )
}

/**
 * Connection of the chosen wallet: connected, not connected, connecting, refused by
 * the wallet app, or dropped by it (seen on the next check). Buttons keep their focus
 * while busy (aria-disabled) and ignore repeated activations.
 */
function WalletConnectionControl({ userId, walletId }: { userId: string; walletId: string }) {
  const connection = useWalletConnection(userId, walletId)
  const connect = useConnectWallet(userId)
  const disconnect = useDisconnectWallet(userId)
  const announce = useAnnounce()
  const busy = connect.isPending || disconnect.isPending
  const connected = connection.data?.status === 'connected'
  const refused = connect.error instanceof ApiError && connect.error.code === 'WALLET_REJECTED'

  function onConnect() {
    if (busy) return
    disconnect.reset()
    connect.mutate(walletId, { onSuccess: () => announce('Carteira conectada.') })
  }

  function onDisconnect() {
    if (busy) return
    connect.reset()
    disconnect.mutate(walletId, { onSuccess: () => announce('Carteira desconectada.') })
  }

  return (
    <div data-testid="wallet-connection" className="flex flex-col gap-2 rounded-[8px] bg-surface-raised p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" data-testid="wallet-connection-status" className="text-body-14 text-cream">
          {connection.isPending
            ? 'Verificando conexão…'
            : connect.isPending
              ? 'Aguardando a aprovação na carteira…'
              : connected
                ? 'Carteira conectada'
                : 'Carteira não conectada'}
        </p>
        <button
          type="button"
          onClick={connected ? onDisconnect : onConnect}
          aria-disabled={busy || connection.isPending || undefined}
          className={cn(
            'h-9 rounded-[6px] px-3 text-body-14 font-bold aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
            connected ? 'border border-brand text-brand-accent' : 'bg-brand text-ink hover:bg-brand-accent',
            focusRing,
          )}
        >
          {connect.isPending ? 'Conectando…' : disconnect.isPending ? 'Desconectando…' : connected ? 'Desconectar' : 'Conectar carteira'}
        </button>
      </div>
      {refused ? (
        <p role="alert" className="text-caption-13 text-coral">
          {errorMessage(connect.error)} Tente de novo ou escolha outra carteira.
        </p>
      ) : connect.error && !(connect.error instanceof ApiError && connect.error.code === 'SESSION_CHANGED') ? (
        <p role="alert" className="text-caption-13 text-coral">
          Não foi possível conectar. {errorMessage(connect.error)}
        </p>
      ) : connection.isError ? (
        <p role="alert" className="text-caption-13 text-coral">
          Não foi possível verificar a conexão. {errorMessage(connection.error)}
        </p>
      ) : null}
    </div>
  )
}
