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

/** Mobile tab bar (Figma "Tab Bar"): icons with accessible names, scan button in the middle. */
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
      className="fixed inset-x-0 bottom-0 z-30 rounded-t-[28px] bg-surface-card pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgb(10_6_4/0.45)] md:hidden"
    >
      <ul className="relative flex h-[72px] items-center px-4">
        {tabs.slice(0, 2).map(renderTab)}
        <li className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Escanear NFT"
            onClick={() => announce('A leitura de NFTs pela câmera não faz parte desta demonstração.')}
            className={cn(
              '-mt-10 flex size-[65px] items-center justify-center rounded-full bg-linear-to-br from-brand/45 to-brand text-cream shadow-glow ring-4 ring-ink',
              'outline-none focus-visible:ring-ring',
            )}
          >
            <Icon name="tab-scan" className="size-6" />
          </button>
        </li>
        {tabs.slice(2).map(renderTab)}
      </ul>
    </nav>
  )
}
