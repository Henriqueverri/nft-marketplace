import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { env } from '@/app/env'
import {
  failureModeSchema,
  realtimeClientModeSchema,
  type FailureMode,
  type MockState,
  type RealtimeClientMode,
} from '@/contracts/mock'
import { useSession, useSessionSnapshot } from '@/features/auth/queries'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { errorMessage } from '@/shared/forms/form-errors'
import {
  useRealtimeStatus,
  useRealtimeSubscriptionCount,
  type RealtimeConnectionState,
} from '@/shared/realtime/context'
import { sessionQueryKey } from '@/shared/session/query-keys'
import { sessionStore } from '@/shared/session/session-store'
import { expireSessions, fetchMockState, resetMockState, updateScenario } from './api'

const stateLabel: Record<RealtimeConnectionState, string> = {
  idle: 'inativo',
  connecting: 'conectando',
  connected: 'conectado',
  disconnected: 'desconectado',
  rejected: 'recusado',
  unavailable: 'indisponível',
}

const failureLabel: Record<FailureMode, string> = {
  none: 'Nenhuma falha',
  'server-error': 'Erro interno (500)',
  unavailable: 'Serviço indisponível (503)',
  offline: 'Sem rede',
}

const realtimeClientLabel: Record<RealtimeClientMode, string> = {
  available: 'Disponível',
  unavailable: 'Falha ao carregar',
}

const LATENCY_OPTIONS = [0, 100, 800, 1500, 3000]

const mockStateKey = ['mock', 'state'] as const

function Item({ label, testId, children }: { label: string; testId: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt>{label}:</dt>
      <dd data-testid={testId}>{children}</dd>
    </div>
  )
}

/**
 * Demo diagnostics and scenario controls. Every action goes through the mock control
 * API (/__mock/*), which exists only while the MSW mocks are enabled.
 */
export function DemoPanel() {
  const status = useRealtimeStatus()
  const subscriptions = useRealtimeSubscriptionCount()
  const session = useSession()

  return (
    <aside
      aria-label="Painel da demonstração"
      className="border-t border-border-strong bg-surface-card px-4 py-3 text-caption-12 text-text-secondary"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1">
          <Item label="Mocks" testId="mocks-state">
            {env.enableMocks ? 'ativos' : 'desativados'}
          </Item>
          <Item label="Sessão" testId="session-user">
            {session.data ? `@${session.data.user.username}` : 'visitante'}
          </Item>
          <Item label="Tempo real" testId="realtime-state">
            {stateLabel[status.state]}
          </Item>
          <Item label="Identidade no socket" testId="realtime-identity">
            {status.lastHello ? (status.lastHello.payload.userId ?? 'anônima') : '—'}
          </Item>
          <Item label="Conexões" testId="realtime-connects">
            {status.connectCount}
          </Item>
          <Item label="Quedas" testId="realtime-disconnects">
            {status.disconnectCount}
          </Item>
          <Item label="Último motivo" testId="realtime-disconnect-reason">
            {status.lastDisconnectReason ?? '—'}
          </Item>
          <Item label="Último evento" testId="realtime-last-hello">
            {status.lastHello?.payload.connectionId ?? '—'}
          </Item>
          <Item label="Eventos aplicados" testId="realtime-events-applied">
            {status.eventsApplied}
          </Item>
          <Item label="Eventos ignorados" testId="realtime-events-ignored">
            {status.eventsIgnored}
          </Item>
          <Item label="Inscrições" testId="realtime-subscriptions">
            {subscriptions}
          </Item>
          <div className="flex gap-2">
            <dt>Versão:</dt>
            <dd data-testid="commit-sha" data-commit={env.commitSha}>
              {env.commitSha.slice(0, 7)}
            </dd>
          </div>
        </dl>
        {env.enableMocks ? <ScenarioControls /> : null}
      </div>
    </aside>
  )
}

function ScenarioControls() {
  const snapshot = useSessionSnapshot()
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const mockState = useQuery({
    queryKey: mockStateKey,
    queryFn: ({ signal }) => fetchMockState(signal),
    refetchInterval: 3_000,
    retry: false,
  })

  const invalidateState = () => queryClient.invalidateQueries({ queryKey: mockStateKey })

  const scenario = useMutation({
    mutationFn: updateScenario,
    onSuccess: () => {
      void invalidateState()
      announce('Cenário aplicado.')
    },
    onError: (error) => announce(errorMessage(error)),
  })

  const expire = useMutation({
    mutationFn: expireSessions,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey })
      void invalidateState()
    },
    onError: (error) => announce(errorMessage(error)),
  })

  const reset = useMutation({
    mutationFn: resetMockState,
    onSuccess: () => {
      sessionStore.end('reset')
      window.location.assign('/')
    },
    onError: (error) => announce(errorMessage(error)),
  })

  return (
    <div className="flex flex-col gap-2 border-t border-border-strong pt-3">
      <MockStateSummary state={mockState.data} error={mockState.error} />
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {mockState.data ? (
          <ScenarioForm
            key={`${mockState.data.scenario.latencyMs}:${mockState.data.scenario.failure}:${mockState.data.scenario.realtimeClient}`}
            initial={mockState.data.scenario}
            pending={scenario.isPending}
            onApply={(next) => scenario.mutate(next)}
          />
        ) : null}
        <button
          type="button"
          disabled={!snapshot.token || expire.isPending}
          onClick={() => expire.mutate()}
          className="h-8 rounded-[5px] border border-border-field px-3 text-cream outline-none hover:border-brand focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Expirar sessão
        </button>
        <button
          type="button"
          disabled={reset.isPending}
          onClick={() => reset.mutate()}
          className="h-8 rounded-[5px] border border-coral/70 px-3 text-coral outline-none hover:border-coral focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          Restaurar estado inicial
        </button>
      </div>
    </div>
  )
}

function MockStateSummary({ state, error }: { state: MockState | undefined; error: unknown }) {
  if (error) return <p className="text-coral">Painel sem acesso aos mocks: {errorMessage(error)}</p>
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1">
      <Item label="Cenário" testId="scenario-current">
        {state ? `${state.scenario.latencyMs} ms · ${failureLabel[state.scenario.failure]}` : '—'}
      </Item>
      <Item label="Armazenamento" testId="storage-state">
        {state ? (state.storage.status === 'ok' ? `ok (${state.storage.bytes} bytes)` : 'corrompido') : '—'}
      </Item>
      <Item label="Usuários" testId="mock-users-count">
        {state?.counts.users ?? '—'}
      </Item>
      <Item label="Sessões ativas" testId="mock-active-sessions">
        {state?.counts.activeSessions ?? '—'}
      </Item>
    </dl>
  )
}

interface ScenarioFormProps {
  initial: MockState['scenario']
  pending: boolean
  onApply: (scenario: MockState['scenario']) => void
}

function ScenarioForm({ initial, pending, onApply }: ScenarioFormProps) {
  const [latencyMs, setLatencyMs] = useState(initial.latencyMs)
  const [failure, setFailure] = useState<FailureMode>(initial.failure)
  const [realtimeClient, setRealtimeClient] = useState<RealtimeClientMode>(initial.realtimeClient)
  const latencyOptions = LATENCY_OPTIONS.includes(initial.latencyMs)
    ? LATENCY_OPTIONS
    : [...LATENCY_OPTIONS, initial.latencyMs].sort((a, b) => a - b)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onApply({ latencyMs, failure, realtimeClient })
  }

  const selectClass =
    'h-8 rounded-[5px] border border-border-field bg-ink px-2 text-cream outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-x-3 gap-y-2" aria-label="Cenário da API">
      <label className="flex flex-col gap-1">
        Latência
        <select value={latencyMs} onChange={(event) => setLatencyMs(Number(event.target.value))} className={selectClass}>
          {latencyOptions.map((value) => (
            <option key={value} value={value}>
              {value} ms
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Falha da API
        <select
          value={failure}
          onChange={(event) => setFailure(failureModeSchema.parse(event.target.value))}
          className={selectClass}
        >
          {failureModeSchema.options.map((mode) => (
            <option key={mode} value={mode}>
              {failureLabel[mode]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Cliente de tempo real
        <select
          value={realtimeClient}
          onChange={(event) => setRealtimeClient(realtimeClientModeSchema.parse(event.target.value))}
          className={selectClass}
        >
          {realtimeClientModeSchema.options.map((mode) => (
            <option key={mode} value={mode}>
              {realtimeClientLabel[mode]}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-8 rounded-[5px] bg-brand px-3 font-bold text-ink outline-none hover:bg-brand-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        Aplicar cenário
      </button>
    </form>
  )
}
