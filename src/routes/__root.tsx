import { createRootRouteWithContext, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import type { RouterContext } from '@/app/router'
import { useLogout, useSession } from '@/features/auth/queries'
import { DemoPanel } from '@/features/demo/DemoPanel'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query'
import { NotFoundPage } from '@/shared/layout/NotFoundPage'
import { RealtimeUnavailableNotice } from '@/shared/realtime/RealtimeUnavailableNotice'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const navLinkClass =
  'rounded-sm px-1 py-0.5 text-body-14 text-cream hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

const AUTH_PATHS = ['/login', '/signup']

function RootLayout() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const pathname = useLocation({ select: (location) => location.pathname })
  // On mobile the auth screens are standalone pages with their own logo (Figma).
  const showHeader = isDesktop || !AUTH_PATHS.includes(pathname)

  return (
    <div className="flex min-h-dvh flex-col">
      {showHeader ? <SiteHeader /> : null}
      <RealtimeUnavailableNotice />
      <main className="flex-1">
        <Outlet />
      </main>
      <DemoPanel />
    </div>
  )
}

/** Provisional header; the Figma header lands in F2. */
function SiteHeader() {
  const session = useSession()
  const logout = useLogout()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const href = useLocation({ select: (location) => location.href })
  const user = session.data?.user

  function handleLogout() {
    logout.mutate(undefined, {
      onSettled: async () => {
        await navigate({ to: '/', replace: true })
        announce('Você saiu da sua conta.')
      },
    })
  }

  return (
    <header className="border-b border-border-strong">
      <nav
        aria-label="Principal"
        className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4"
      >
        <Link to="/" className="text-body-16 font-bold tracking-widest text-cream">
          KURIO
        </Link>
        <Link to="/" className={navLinkClass} activeProps={{ className: 'text-brand-accent' }}>
          Início
        </Link>
        <Link to="/cart" className={navLinkClass}>
          Carrinho
        </Link>
        <Link to="/account/profile" className={navLinkClass}>
          Meu perfil
        </Link>
        {user ? (
          <>
            <span data-testid="header-user" className="text-body-14 text-text-secondary">
              {user.displayName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              disabled={logout.isPending}
              className={navLinkClass}
            >
              {logout.isPending ? 'Saindo…' : 'Sair'}
            </button>
          </>
        ) : (
          <Link
            to="/login"
            search={AUTH_PATHS.includes(href.split('?')[0]) || href === '/' ? {} : { redirect: href }}
            className={navLinkClass}
          >
            Entrar
          </Link>
        )}
      </nav>
    </header>
  )
}
