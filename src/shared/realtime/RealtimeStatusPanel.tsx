import { env } from '@/app/env'
import { useRealtimeStatus, type RealtimeConnectionState } from './context'

const stateLabel: Record<RealtimeConnectionState, string> = {
  idle: 'inativo',
  connecting: 'conectando',
  connected: 'conectado',
  disconnected: 'desconectado',
}

/** Provisional diagnostics for the foundation phase; replaced by the scenario panel later. */
export function RealtimeStatusPanel() {
  const status = useRealtimeStatus()

  return (
    <aside
      aria-label="Diagnóstico da demonstração"
      className="border-t border-border-strong bg-surface-card px-4 py-3 text-caption-12 text-text-secondary"
    >
      <dl className="mx-auto flex w-full max-w-[1200px] flex-wrap gap-x-6 gap-y-1">
        <div className="flex gap-2">
          <dt>Mocks:</dt>
          <dd data-testid="mocks-state">{env.enableMocks ? 'ativos' : 'desativados'}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Tempo real:</dt>
          <dd data-testid="realtime-state">{stateLabel[status.state]}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Conexões:</dt>
          <dd data-testid="realtime-connects">{status.connectCount}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Quedas:</dt>
          <dd data-testid="realtime-disconnects">{status.disconnectCount}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Último motivo:</dt>
          <dd data-testid="realtime-disconnect-reason">{status.lastDisconnectReason ?? '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Último evento:</dt>
          <dd data-testid="realtime-last-hello">{status.lastHello?.payload.connectionId ?? '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt>Versão:</dt>
          <dd data-testid="commit-sha" data-commit={env.commitSha}>{env.commitSha.slice(0, 7)}</dd>
        </div>
      </dl>
    </aside>
  )
}
