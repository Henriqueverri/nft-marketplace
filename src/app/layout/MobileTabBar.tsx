import { Link, useLocation } from '@tanstack/react-router'
import { cartLinkLabel, useCartCount } from '@/features/cart/cart-count'
import { CartCountBadge } from '@/features/cart/components/CartBadge'
import { cn } from '@/lib/utils'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { Icon, type IconName } from '@/shared/ui/Icon'

const tabs: { to: '/' | '/account/favorites' | '/cart' | '/account/profile'; label: string; icon: IconName }[] = [
  { to: '/', label: 'Início', icon: 'tab-home' },
  { to: '/account/favorites', label: 'Lista de interesse', icon: 'tab-heart' },
  { to: '/cart', label: 'Carrinho', icon: 'tab-shop' },
  { to: '/account/profile', label: 'Meu perfil', icon: 'tab-user' },
]

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Tab bar silhouette from Figma (414×95 path with center cradle for the scan button). */
const TAB_BAR_PATH =
  'M282.85 0C269.09 0 256.87 8.2 251.02 20.65C243.26 37.17 226.46 48.62 207 48.62C187.54 48.62 170.74 37.18 162.98 20.65C157.13 8.2 144.9 0 131.15 0H28.93C12.95 0 0 12.95 0 28.93V95H414V28.93C414 12.95 401.05 0 385.07 0H282.85Z'

/** Mobile tab bar (Figma "Tab Bar"): curved cradle around the scan button, icons on the sides. */
export function MobileTabBar() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const announce = useAnnounce()
  const cartCount = useCartCount()

  const renderTab = (tab: (typeof tabs)[number]) => {
    const active = pathname === tab.to
    const isCart = tab.to === '/cart'
    return (
      <li key={tab.to} className="flex flex-1 justify-center">
        <Link
          to={tab.to}
          aria-label={isCart ? cartLinkLabel(cartCount) : tab.label}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex size-11 items-center justify-center rounded-full',
            focusRing,
            active ? 'text-brand-accent' : 'text-text-secondary hover:text-cream',
          )}
        >
          <span className="relative">
            <Icon name={tab.icon} className="size-5" />
            {isCart ? <CartCountBadge count={cartCount} /> : null}
          </span>
        </Link>
      </li>
    )
  }

  return (
    <nav
      aria-label="Atalhos"
      className="fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="relative h-[95px] w-full">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full drop-shadow-[0_-10px_30px_rgb(10_6_4/0.45)]"
          viewBox="0 0 414 95"
          fill="none"
          preserveAspectRatio="none"
        >
          <path d={TAB_BAR_PATH} className="fill-surface-card" />
        </svg>

        <button
          type="button"
          aria-label="Escanear NFT"
          onClick={() => announce('A leitura de NFTs pela câmera não faz parte desta demonstração.')}
          className={cn(
            'absolute top-0 left-1/2 z-10 flex size-[65px] -translate-x-1/2 -translate-y-8 items-center justify-center rounded-full',
            'bg-linear-to-b from-brand/40 to-brand text-cream',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Icon name="tab-scan" className="size-6" />
        </button>

        <ul className="relative flex h-full items-center px-4">
          {tabs.slice(0, 2).map(renderTab)}
          <li className="w-[65px] shrink-0" aria-hidden="true" />
          {tabs.slice(2).map(renderTab)}
        </ul>
      </div>
    </nav>
  )
}
