import { Link, useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const links = [
  { to: '/account/profile' as const, label: 'Perfil' },
  { to: '/account/wallets' as const, label: 'Carteiras' },
  { to: '/account/orders' as const, label: 'Pedidos' },
]

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-8 md:flex-row md:gap-10 md:px-6 md:py-12 xl:px-0">
      <nav aria-label="Conta" className="md:w-52 md:shrink-0">
        <ul className="flex overflow-x-auto border-b border-border-soft md:flex-col md:overflow-visible md:border-b-0 md:border-r">
          {links.map((link) => {
            const active = pathname === link.to
            return (
              <li key={link.to} className="shrink-0 md:w-full">
                <Link
                  to={link.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block border-b-2 px-4 py-3 text-body-14 font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring md:border-r-2 md:border-b-0',
                    active
                      ? 'border-brand text-brand-accent'
                      : 'border-transparent text-text-secondary hover:text-cream',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <section className="min-w-0 flex-1">{children}</section>
    </div>
  )
}
