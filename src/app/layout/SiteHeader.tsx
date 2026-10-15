import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useLogout, useSession } from '@/features/auth/queries'
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

  async function openSearch() {
    if (focusCatalogSearch()) return
    await navigate({ to: '/' })
    requestAnimationFrame(() => focusCatalogSearch())
  }

  const itemClass = (active: boolean) =>
    cn(
      'relative block rounded-sm py-1 text-body-16 after:absolute after:inset-x-0 after:-bottom-[13px] after:h-[3px] after:rounded-full',
      focusRing,
      active ? 'font-bold text-brand-accent after:bg-brand' : 'text-cream hover:text-brand-accent',
    )

  const unavailable = (label: string) => () => announce(`${label} não faz parte desta demonstração.`)

  return (
    <header className="hidden px-6 pt-6 md:block xl:px-0">
      <nav aria-label="Principal" className="mx-auto flex h-[45px] w-full max-w-[1200px] items-center justify-between gap-6">
        <Link to="/" className={cn('rounded-sm text-body-14 font-bold tracking-[1.4px] text-cream', focusRing)}>
          KURIO
        </Link>
        <ul className="flex items-center gap-6 lg:gap-10">
          <li>
            <Link to="/" aria-current={pathname === '/' ? 'page' : undefined} className={itemClass(pathname === '/')}>
              Início
            </Link>
          </li>
          <li>
            <Link to="/" hash="catalogo" className={itemClass(pathname.startsWith('/nfts/'))}>
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
        <div className="flex items-center gap-4">
          <button
            type="button"
            aria-label="Buscar NFTs"
            onClick={() => void openSearch()}
            className={cn('flex size-8 items-center justify-center rounded-full text-cream hover:text-brand-accent', focusRing)}
          >
            <Icon name="search" />
          </button>
          <Link
            to="/cart"
            aria-label="Carrinho"
            className={cn('flex size-8 items-center justify-center rounded-full text-cream hover:text-brand-accent', focusRing)}
          >
            <Icon name="cart" className="size-6" />
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
                'flex h-[35px] items-center gap-1.5 rounded-[6px] bg-brand px-3 text-body-16 font-medium text-ink hover:bg-brand-accent',
                focusRing,
              )}
            >
              <Icon name="login" className="size-5" />
              Entrar
            </Link>
          )}
        </div>
      </nav>
      <div aria-hidden="true" className="mx-auto mt-[10px] h-px w-full max-w-[1200px] bg-brand/30" />
    </header>
  )
}

/**
 * Mobile identity bar. The Figma mobile frames have no header; this slim bar keeps
 * sign-in and sign-out one tap away on every screen.
 */
export function MobileTopBar() {
  const session = useSession()
  const user = session.data?.user
  const logout = useLogoutAndLeave()
  const loginSearch = useLoginSearch()

  return (
    <header className="px-4 pt-4 md:hidden">
      <nav aria-label="Principal" className="flex h-9 items-center justify-between gap-3">
        <Link to="/" className={cn('rounded-sm text-body-14 font-bold tracking-[1.4px] text-cream', focusRing)}>
          KURIO
        </Link>
        {user ? (
          <div className="flex min-w-0 items-center gap-3">
            <span data-testid="header-user" className="truncate text-caption-13 text-text-secondary">
              {user.displayName}
            </span>
            <button
              type="button"
              onClick={logout.run}
              disabled={logout.pending}
              className={cn('h-8 shrink-0 rounded-[6px] border border-brand px-3 text-caption-13 font-medium text-cream disabled:opacity-60', focusRing)}
            >
              {logout.pending ? 'Saindo…' : 'Sair'}
            </button>
          </div>
        ) : (
          <Link
            to="/login"
            search={loginSearch}
            className={cn('flex h-8 items-center gap-1.5 rounded-[6px] bg-brand px-3 text-caption-13 font-bold text-ink', focusRing)}
          >
            <Icon name="login" className="size-4" />
            Entrar
          </Link>
        )}
      </nav>
    </header>
  )
}
