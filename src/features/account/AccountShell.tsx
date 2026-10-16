import { Link, useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import activityIcon from '@/assets/icons/account/activity.svg'
import downloadIcon from '@/assets/icons/account/download.svg'
import heartIcon from '@/assets/icons/account/heart.svg'
import locationIcon from '@/assets/icons/account/location.svg'
import logoutIcon from '@/assets/icons/account/logout.svg'
import shoppingIcon from '@/assets/icons/account/shopping.svg'
import supportIcon from '@/assets/icons/account/support.svg'
import userIcon from '@/assets/icons/account/user.svg'
import { useLogout } from '@/features/auth/queries'
import { cn } from '@/lib/utils'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { Icon } from '@/shared/ui/Icon'

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

function useAccountLogout() {
  const logout = useLogout()
  const navigate = useNavigate()
  const announce = useAnnounce()
  return {
    pending: logout.isPending,
    run: () =>
      logout.mutate(undefined, {
        onSettled: async () => {
          await navigate({ to: '/', replace: true })
          announce('Você saiu da sua conta.')
        },
      }),
  }
}

type AccountPath = '/account/profile' | '/account/wallets' | '/account/favorites' | '/account/orders'

type NavLink = {
  kind: 'link'
  to: AccountPath
  label: string
  shortLabel: string
  icon: string
  iconClass?: string
}

type NavUnavailable = {
  kind: 'unavailable'
  label: string
  icon: string
  iconClass?: string
}

/** Desktop sidebar (Figma Account Sidebar), including out-of-scope stubs. */
const desktopLinks: Array<NavLink | NavUnavailable> = [
  { kind: 'link', to: '/account/profile', label: 'Dados do perfil', shortLabel: 'Perfil', icon: userIcon, iconClass: 'size-[18px]' },
  { kind: 'link', to: '/account/wallets', label: 'Carteiras', shortLabel: 'Carteiras', icon: locationIcon, iconClass: 'size-5' },
  { kind: 'unavailable', label: 'Atividade', icon: shoppingIcon, iconClass: 'size-[18px]' },
  { kind: 'link', to: '/account/favorites', label: 'Lista de interesse', shortLabel: 'Favoritos', icon: heartIcon, iconClass: 'size-4' },
  { kind: 'unavailable', label: 'Ofertas', icon: activityIcon, iconClass: 'size-[18px]' },
  { kind: 'unavailable', label: 'Arquivos baixados', icon: downloadIcon, iconClass: 'size-[18px]' },
  { kind: 'unavailable', label: 'Suporte', icon: supportIcon, iconClass: 'size-[18px]' },
]

/** Mobile switcher: only destinations that actually exist (plus pedidos, linked from the footer on desktop). */
const mobileLinks: NavLink[] = [
  { kind: 'link', to: '/account/profile', label: 'Dados do perfil', shortLabel: 'Perfil', icon: userIcon, iconClass: 'size-[18px]' },
  { kind: 'link', to: '/account/wallets', label: 'Carteiras', shortLabel: 'Carteiras', icon: locationIcon, iconClass: 'size-5' },
  { kind: 'link', to: '/account/favorites', label: 'Lista de interesse', shortLabel: 'Favoritos', icon: heartIcon, iconClass: 'size-4' },
  { kind: 'link', to: '/account/orders', label: 'Meus pedidos', shortLabel: 'Pedidos', icon: shoppingIcon, iconClass: 'size-[18px]' },
]

const itemClass =
  'flex h-[45px] w-full items-center gap-3 px-4 text-left text-body-15 text-brand-accent outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
const activeClass = 'border-l-[6px] border-brand pl-[10px]'

function currentAccountLink(pathname: string): NavLink {
  return (
    mobileLinks.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)) ?? mobileLinks[0]!
  )
}

/**
 * Account layout: desktop keeps the Figma sidebar (310px). Mobile has no account frames
 * in Figma — Screen Header + section switcher replace the horizontal sidebar strip.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const announce = useAnnounce()
  const logout = useAccountLogout()
  const router = useRouter()
  const navigate = useNavigate()
  const current = currentAccountLink(pathname)

  function goBack() {
    if (window.history.length > 1) router.history.back()
    else void navigate({ to: '/' })
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-4 md:flex-row md:gap-7 md:px-6 md:py-6 xl:px-0">
      {/* Mobile: Screen Header (same pattern as cart / checkout). */}
      <div className="relative flex h-[35px] shrink-0 items-center justify-center md:hidden">
        <button
          type="button"
          aria-label="Voltar"
          onClick={goBack}
          className={cn(
            'absolute left-0 flex size-[35px] items-center justify-center rounded-full border border-border-field bg-surface-raised text-sand',
            focusRing,
          )}
        >
          <Icon name="arrow-left" className="size-5" />
        </button>
        {/* Visual title only — each page keeps the real h1 (sr-only on mobile) for a11y/focus. */}
        <p aria-hidden="true" className="text-title-20 font-bold text-cream">
          {current.label}
        </p>
      </div>

      {/* Mobile: section switcher — only real destinations, not the demo stubs. */}
      <nav aria-label="Conta" className="md:hidden">
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {mobileLinks.map((item) => {
            const active = item.to === current.to
            return (
              <li key={item.to} className="shrink-0">
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-[8px] border px-3 py-2 text-caption-13 font-medium whitespace-nowrap',
                    focusRing,
                    active
                      ? 'border-brand bg-surface-card text-brand-accent'
                      : 'border-border-field bg-transparent text-cream hover:border-brand/60 hover:text-brand-accent',
                  )}
                >
                  <img src={item.icon} alt="" aria-hidden className={cn('shrink-0 opacity-90', item.iconClass)} />
                  {item.shortLabel}
                </Link>
              </li>
            )
          })}
        </ul>
        <button
          type="button"
          disabled={logout.pending}
          onClick={logout.run}
          className={cn(
            'mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-[8px] border border-border-field text-body-14 font-bold text-cream hover:border-brand hover:text-brand-accent disabled:opacity-60',
            focusRing,
          )}
        >
          <img src={logoutIcon} alt="" aria-hidden className="size-5 shrink-0" />
          {logout.pending ? 'Saindo…' : 'Sair'}
        </button>
      </nav>

      {/* Desktop: Figma Account Sidebar. */}
      <nav aria-label="Conta" className="hidden h-full bg-surface-card py-2 md:block md:w-[310px] md:shrink-0">
        <p className="px-2.5 py-2.5 text-body-18 font-bold leading-4 text-cream">Meu perfil</p>
        <ul className="flex flex-col">
          {desktopLinks.map((item) => {
            if (item.kind === 'unavailable') {
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    className={cn(itemClass, 'gap-3')}
                    onClick={() => announce(`${item.label} indisponível na demonstração.`)}
                  >
                    <img src={item.icon} alt="" aria-hidden className={cn('shrink-0', item.iconClass)} />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                </li>
              )
            }

            const active = pathname === item.to || pathname.startsWith(`${item.to}/`)
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(itemClass, active && activeClass)}
                >
                  <img src={item.icon} alt="" aria-hidden className={cn('shrink-0', item.iconClass)} />
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="mt-0 border-t border-border-field" />
        <button
          type="button"
          disabled={logout.pending}
          onClick={logout.run}
          className={cn(itemClass, 'mt-0 h-10 gap-2 font-bold')}
        >
          <img src={logoutIcon} alt="" aria-hidden className="size-5 shrink-0" />
          {logout.pending ? 'Saindo…' : 'Sair'}
        </button>
      </nav>

      <section className="min-w-0 flex-1">{children}</section>
    </div>
  )
}
