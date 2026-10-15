import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router'
import { MobileTabBar } from '@/app/layout/MobileTabBar'
import { MobileTopBar, SiteHeader } from '@/app/layout/SiteHeader'
import { SiteFooter } from '@/app/layout/SiteFooter'
import type { RouterContext } from '@/app/router'
import { useNftRealtimeSync } from '@/features/catalog/realtime-sync'
import { DemoPanel } from '@/features/demo/DemoPanel'
import { cn } from '@/lib/utils'
import { DESKTOP_MEDIA_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query'
import { NotFoundPage } from '@/shared/layout/NotFoundPage'
import { RealtimeUnavailableNotice } from '@/shared/realtime/RealtimeUnavailableNotice'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
})

const AUTH_PATHS = ['/login', '/signup']

function RootLayout() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY)
  const pathname = useLocation({ select: (location) => location.pathname })
  useNftRealtimeSync()

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
      {/* At least a viewport tall: while a route or its data loads, the footer stays
          below the fold instead of jumping down when the content arrives. */}
      <main id="conteudo" tabIndex={-1} className="min-h-dvh flex-1 outline-none">
        <Outlet />
      </main>
      {isDesktop || !authPage ? <SiteFooter /> : null}
      <DemoPanel />
      {showTabBar ? <MobileTabBar /> : null}
    </div>
  )
}
