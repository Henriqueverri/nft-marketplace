import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { MobileTabBar } from '@/app/layout/MobileTabBar'
import { MobileTopBar, SiteHeader } from '@/app/layout/SiteHeader'
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

// Demo tooling only: keep it off the initial Home/detail JS graph and __mock/state fetch.
const DemoPanel = lazy(() =>
  import('@/features/demo/DemoPanel').then((module) => ({ default: module.DemoPanel })),
)

function RootLayout() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const pathname = useLocation({ select: (location) => location.pathname })
  useNftRealtimeSync()
  useCartNoticesAnnouncer()

  // On mobile the auth screens are standalone pages with their own logo (Figma), and
  // the NFT detail replaces the tab bar with its buy bar.
  const authPage = AUTH_PATHS.includes(pathname)
  const detailPage = pathname.startsWith('/nfts/')
  const showTabBar = !isDesktop && !authPage && !detailPage
  // Room for the fixed bottom bars, so the footer and demo panel are never covered.
  const bottomSpace = isDesktop ? '' : showTabBar ? 'pb-[88px]' : detailPage ? 'pb-[180px]' : ''

  return (
    <div className={cn('flex min-h-dvh flex-col', bottomSpace)}>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-[6px] bg-brand px-4 py-2 font-bold text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Pular para o conteúdo
      </a>
      {isDesktop ? <SiteHeader /> : authPage ? null : <MobileTopBar />}
      <RealtimeUnavailableNotice />
      <OrderNotices />
      {/* At least a viewport tall: while a route or its data loads, the footer stays
          below the fold instead of jumping down when the content arrives. */}
      <main id="conteudo" tabIndex={-1} className="min-h-dvh flex-1 outline-none">
        <Outlet />
      </main>
      {isDesktop || !authPage ? <SiteFooter /> : null}
      <Suspense fallback={null}>
        <DemoPanel />
      </Suspense>
      {showTabBar ? <MobileTabBar /> : null}
    </div>
  )
}
