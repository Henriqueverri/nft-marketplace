import { createFileRoute, Outlet, redirect, useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AuthenticatedUserContext } from '@/features/auth/authenticated-user'
import { sessionQueryOptions, useSession, useSessionSnapshot } from '@/features/auth/queries'
import { errorMessage } from '@/shared/forms/form-errors'
import { sessionStore } from '@/shared/session/session-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    const session = await context.queryClient.fetchQuery(sessionQueryOptions())
    if (!session) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
          ...(sessionStore.getSnapshot().endReason === 'expired' ? { reason: 'expired' as const } : {}),
        },
        replace: true,
      })
    }
  },
  component: AuthenticatedLayout,
  errorComponent: SessionCheckError,
})

/**
 * The guard runs on navigation; this component covers the session ending while the
 * user stays on a private screen (logout, expiry detected by any request, reset).
 */
function AuthenticatedLayout() {
  const snapshot = useSessionSnapshot()
  const session = useSession()
  const href = useLocation({ select: (location) => location.href })
  const navigate = useNavigate()
  const hasSession = snapshot.token !== null

  // Imperative and once per session change: <Navigate> re-navigates on every render
  // while this route is still mounted during the transition, which never settles.
  useEffect(() => {
    if (hasSession) return
    if (snapshot.endReason === 'expired') {
      void navigate({ to: '/login', search: { redirect: href, reason: 'expired' }, replace: true })
    } else {
      void navigate({ to: '/', replace: true })
    }
    // `href` is read at the moment the session ends; later URL changes must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, snapshot.epoch])

  if (!hasSession) return null

  const user = session.data?.user
  if (!user || user.id !== snapshot.userId) {
    if (session.isError) return <SessionCheckError error={session.error} reset={() => void session.refetch()} />
    return (
      <p role="status" className="mx-auto w-full max-w-[1200px] px-4 py-12 text-body-14 text-text-secondary">
        Verificando sua sessão…
      </p>
    )
  }

  return (
    <AuthenticatedUserContext.Provider value={user}>
      <Outlet />
    </AuthenticatedUserContext.Provider>
  )
}

function SessionCheckError({ error, reset }: { error: unknown; reset: () => void }) {
  const router = useRouter()
  return (
    <section role="alert" className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-3 px-4 py-12">
      <h1 className="text-title-20 font-bold text-cream">Não foi possível verificar sua sessão</h1>
      <p className="text-body-14 text-text-secondary">{errorMessage(error)}</p>
      <button
        type="button"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
        className="rounded-[5px] bg-brand px-4 py-2 text-body-14 font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Tentar novamente
      </button>
    </section>
  )
}
