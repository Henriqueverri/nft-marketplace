import { useRealtimeRetry, useRealtimeStatus } from './context'

/**
 * Tells the user when live updates stop. The app keeps working on REST data; when
 * the connection returns, realtime-backed queries are refetched (reconciliation).
 */
export function RealtimeUnavailableNotice() {
  const { state } = useRealtimeStatus()
  const retry = useRealtimeRetry()

  if (state === 'disconnected') {
    return (
      <div
        role="status"
        data-testid="realtime-notice"
        className="border-b border-amber/40 bg-surface-card px-4 py-2 text-caption-13 text-cream"
      >
        <p className="mx-auto w-full max-w-[1200px]">
          Conexão em tempo real interrompida. Tentando reconectar… Preços e estoques exibidos podem estar
          desatualizados e serão conferidos assim que a conexão voltar.
        </p>
      </div>
    )
  }

  if (state !== 'unavailable') return null

  return (
    <div role="alert" className="border-b border-coral/50 bg-surface-card px-4 py-2 text-caption-13 text-cream">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2">
        <p>
          Atualizações em tempo real indisponíveis. Você pode continuar navegando, mas preços e pedidos não serão
          atualizados automaticamente.
        </p>
        <button
          type="button"
          onClick={retry}
          className="rounded-[5px] border border-border-field px-3 py-1 text-cream outline-none hover:border-brand focus-visible:ring-2 focus-visible:ring-ring"
        >
          Tentar conectar novamente
        </button>
      </div>
    </div>
  )
}
