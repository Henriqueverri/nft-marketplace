import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useLogout, useSession } from '@/features/auth/queries'
import { cartLinkLabel, useCartCount } from '@/features/cart/cart-count'
import { CartCountBadge } from '@/features/cart/components/CartBadge'
import { focusCatalogSearch } from '@/features/catalog/use-catalog-navigation'
import { cn } from '@/lib/utils'
import { useAnnounce } from '@/shared/feedback/announcer-context'
import { Icon } from '@/shared/ui/Icon'

const AUTH_PATHS = ['/login', '/signup']

const focusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink'

function useLogoutAndLeave() {
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

/** Return path kept when the visitor goes to login from any page but the home and auth pages. */
function useLoginSearch() {
  const href = useLocation({ select: (location) => location.href })
  const path = href.split(/[?#]/)[0]
  return AUTH_PATHS.includes(path) || href === '/' ? {} : { redirect: href }
}

/** Desktop and tablet header (Figma "Header With Divider"). */
export function SiteHeader() {
  const session = useSession()
  const user = session.data?.user
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigate = useNavigate()
  const announce = useAnnounce()
  const logout = useLogoutAndLeave()
  const loginSearch = useLoginSearch()
  const cartCount = useCartCount()

  async function openSearch() {
    if (focusCatalogSearch()) return
    await navigate({ to: '/' })
    requestAnimationFrame(() => focusCatalogSearch())
  }

  // Active underline is brand (#D28A4C) 3px; hairline below the row is the same color at 0.3px (Figma).
  const itemClass = (active: boolean) =>
    cn(
      'relative block pb-6 text-body-16 after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-brand after:opacity-0',
      focusRing,
      active
        ? 'font-bold text-brand-accent after:opacity-100'
        : 'font-normal text-cream hover:text-brand-accent',
    )

  const unavailable = (label: string) => () => announce(`${label} não faz parte desta demonstração.`)

  return (
    <header className="hidden px-6 pt-6 md:block xl:px-0">
      <nav
        aria-label="Principal"
        className="mx-auto flex w-full max-w-[1200px] items-start justify-between gap-6"
      >
        <Link
          to="/"
          className={cn('rounded-sm pt-2 text-body-14 font-bold tracking-[1.4px] text-cream', focusRing)}
        >
          KURIO
        </Link>
        <ul className="flex items-start gap-10">
          <li>
            <Link to="/" aria-current={pathname === '/' ? 'page' : undefined} className={itemClass(pathname === '/')}>
              Início
            </Link>
          </li>
          <li>
            <Link to="/" hash="catalogo" className={itemClass(pathname.startsWith('/nfts/') || pathname === '/cart')}>
              Mercado
            </Link>
          </li>
          <li>
            <button type="button" onClick={unavailable('A área de criadores')} className={itemClass(false)}>
              Criadores
            </button>
          </li>
          <li>
            <button type="button" onClick={unavailable('A área de conteúdos')} className={itemClass(false)}>
              Aprenda
            </button>
          </li>
        </ul>
        <div className="flex items-center gap-7 self-center">
          <button
            type="button"
            aria-label="Buscar NFTs"
            onClick={() => void openSearch()}
            className={cn('flex size-5 items-center justify-center text-cream hover:text-brand-accent', focusRing)}
          >
            <Icon name="search" className="size-5" />
          </button>
          <Link
            to="/cart"
            aria-label={cartLinkLabel(cartCount)}
            className={cn('flex size-6 items-center justify-center text-cream hover:text-brand-accent', focusRing)}
          >
            <span className="relative">
              <Icon name="cart" className="size-6" />
              <CartCountBadge count={cartCount} />
            </span>
          </Link>
          {user ? (
            <div className="flex items-center gap-3">
              <span data-testid="header-user" className="max-w-[160px] truncate text-body-14 text-text-secondary">
                {user.displayName}
              </span>
              <button
                type="button"
                onClick={logout.run}
                disabled={logout.pending}
                className={cn(
                  'flex h-[35px] items-center rounded-[6px] border border-brand px-3 text-body-14 font-medium text-cream hover:bg-surface-raised disabled:opacity-60',
                  focusRing,
                )}
              >
                {logout.pending ? 'Saindo…' : 'Sair'}
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              search={loginSearch}
              className={cn(
                'flex h-[35px] w-[100px] items-center justify-center gap-1 rounded-[6px] bg-brand text-body-16 font-medium text-ink hover:bg-brand-accent',
                focusRing,
              )}
            >
              <Icon name="login" className="size-5" />
              Entrar
            </Link>
          )}
        </div>
      </nav>
      <div aria-hidden="true" className="mx-auto h-[0.3px] w-full max-w-[1200px] bg-brand-accent" />
    </header>
  )
}
