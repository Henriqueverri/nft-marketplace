import { Link, useNavigate } from '@tanstack/react-router'
import closeIcon from '@/assets/icons/close.svg'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { AuthMode } from './AuthScreen'
import { LoginForm } from './LoginForm'
import { SignupForm } from './SignupForm'

interface AuthDialogProps {
  mode: AuthMode
  redirect: string
  expired: boolean
}

const copy: Record<AuthMode, { title: string; description: string }> = {
  login: {
    title: 'Entrar',
    description: 'Entre para gerenciar sua carteira, coleção e perfil de criador.',
  },
  signup: {
    title: 'Criar conta',
    description: 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.',
  },
}

const tabClass =
  'rounded-[3px] text-title-20 leading-6 font-medium outline-none hover:text-brand-accent focus-visible:ring-2 focus-visible:ring-ring'

/** Desktop sign-in / sign-up modal ("Desktop / Login" and "Desktop / Cadastro" frames). */
export function AuthDialog({ mode, redirect, expired }: AuthDialogProps) {
  const navigate = useNavigate()
  const { title, description } = copy[mode]

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void navigate({ to: '/' })
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-none"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          document.getElementById(mode === 'login' ? 'login-email' : 'signup-username')?.focus()
        }}
        className={cn(
          'top-[160px] flex max-h-[calc(100dvh-180px)] w-[500px] max-w-[calc(100vw-32px)] translate-y-0 flex-col gap-0 overflow-y-auto bg-surface-card p-0 pb-12 text-cream ring-0 sm:max-w-[500px]',
          mode === 'login' ? 'min-h-[600px] rounded-none' : 'min-h-[656px] rounded-lg',
        )}
      >
        <DialogClose
          aria-label="Fechar"
          className="absolute top-[11px] right-3 flex size-6 items-center justify-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img src={closeIcon} alt="" aria-hidden className="size-[18px]" />
        </DialogClose>

        <div className="flex flex-col items-center gap-10 px-12 pt-12">
          <DialogTitle asChild>
            <h1 className="sr-only">{title}</h1>
          </DialogTitle>
          <nav aria-label="Acesso à conta" className="flex items-center gap-2.5">
            <Link
              to="/login"
              search={{ redirect }}
              aria-current={mode === 'login' ? 'page' : undefined}
              className={cn(tabClass, mode === 'login' ? 'text-brand-accent' : 'text-cream')}
            >
              Entrar
            </Link>
            <span aria-hidden className="h-5 w-px bg-coral" />
            <Link
              to="/signup"
              search={{ redirect }}
              aria-current={mode === 'signup' ? 'page' : undefined}
              className={cn(tabClass, mode === 'signup' ? 'text-brand-accent' : 'text-cream')}
            >
              Criar conta
            </Link>
          </nav>
          <DialogDescription className="text-center text-caption-13 text-cream">{description}</DialogDescription>
        </div>

        {mode === 'login' ? (
          <LoginForm variant="dialog" redirect={redirect} expired={expired} />
        ) : (
          <SignupForm variant="dialog" redirect={redirect} />
        )}

        <span aria-hidden className="absolute inset-x-0 bottom-0 h-2.5 bg-brand" />
      </DialogContent>
    </Dialog>
  )
}
