import { Link } from '@tanstack/react-router'
import type { AuthMode } from './AuthScreen'
import { LoginForm } from './LoginForm'
import { SignupForm } from './SignupForm'

interface AuthPageProps {
  mode: AuthMode
  redirect: string
  expired: boolean
}

/** Mobile sign-in / sign-up page ("Mobile / Login" and "Mobile / Cadastro" frames). */
export function AuthPage({ mode, redirect, expired }: AuthPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-[414px] flex-col px-7 pt-20 pb-12 text-cream">
      <div className="flex h-[136px] items-center justify-center">
        <Link
          to="/"
          className="rounded-[3px] text-display-32 font-bold tracking-[3.2px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          KURIO
        </Link>
      </div>
      {mode === 'login' ? (
        <h1 className="mt-10 text-center text-title-20 font-bold">Entrar</h1>
      ) : (
        <h1 className="mt-10 text-center text-body-18 font-bold">Criar perfil de colecionador</h1>
      )}
      <div className="mt-7">
        {mode === 'login' ? (
          <LoginForm variant="page" redirect={redirect} expired={expired} />
        ) : (
          <SignupForm variant="page" redirect={redirect} />
        )}
      </div>
    </div>
  )
}
