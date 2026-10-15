import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import type { RouterContext } from '@/app/router'
import { NotFoundPage } from '@/shared/layout/NotFoundPage'
import { RealtimeStatusPanel } from '@/shared/realtime/RealtimeStatusPanel'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const navLinkClass =
  'rounded-sm px-1 py-0.5 text-body-14 text-cream hover:text-brand-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

function RootLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
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
          <Link to="/login" className={navLinkClass}>
            Entrar
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <RealtimeStatusPanel />
    </div>
  )
}
