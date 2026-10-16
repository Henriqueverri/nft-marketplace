import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { MobileTabBar } from '@/app/layout/MobileTabBar'
import { SiteHeader } from '@/app/layout/SiteHeader'
import { SiteFooter } from '@/app/layout/SiteFooter'
import type { RouterContext } from '@/app/router'
import { useCartNoticesAnnouncer } from '@/features/cart/components/CartNoticesAnnouncer'
import { useNftRealtimeSync } from '@/features/catalog/realtime-sync'
import { OrderNotices } from '@/features/orders/components/OrderNotices'
import { cn } from '@/lib/utils'
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query'
import { NotFoundPage } from '@/shared/layout/NotFoundPage'
import { RealtimeUnavailableNotice } from '@/shared/realtime/RealtimeUnavailableNotice'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const AUTH_PATHS = ['/login', '/signup']

// Off-canvas only: e2e and local scenario controls. Not part of the Figma UI.
const DemoPanel = lazy(() =>
  import('@/features/demo/DemoPanel').then((module) => ({ default: module.DemoPanel })),
)

function RootLayout() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const pathname = useLocation({ select: (location) => location.pathname })
  useNftRealtimeSync()
  useCartNoticesAnnouncer()

  // Mobile rule: the floating tab bar only stays on browsing surfaces. Any screen with a
  // "Voltar" control (detail, cart, checkout, orders, account) hides it.
  const authPage = AUTH_PATHS.includes(pathname)
  const detailPage = pathname.startsWith('/nfts/')
  const backPage =
    detailPage ||
    pathname === '/cart' ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/account')
  const showTabBar = !isDesktop && !authPage && !backPage
  // Internal screens (Voltar) and auth have no site footer — only browsing surfaces do.
  const showFooter = !authPage && !backPage
  const bottomSpace = isDesktop ? '' : showTabBar ? 'pb-[110px]' : detailPage ? 'pb-[180px]' : ''

  return (
    <div className={cn('flex min-h-dvh flex-col', bottomSpace)}>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-[6px] bg-brand px-4 py-2 font-bold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      <SiteHeader />
      <RealtimeUnavailableNotice />
      <OrderNotices />
      {/* At least a viewport tall: while a route or its data loads, the footer stays
          below the fold instead of jumping down when the content arrives. */}
      <main id="conteudo" tabIndex={-1} className="min-h-dvh flex-1 outline-none">
        <Outlet />
      </main>
      {showFooter ? <SiteFooter /> : null}
      {showTabBar ? <MobileTabBar /> : null}
      <div className="pointer-events-none fixed top-0 left-[-100vw] w-[min(100vw,1200px)] overflow-hidden">
        <div className="pointer-events-auto">
          <Suspense fallback={null}>
            <DemoPanel />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
