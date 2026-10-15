import { createFileRoute } from '@tanstack/react-router'
import { AuthScreen } from '@/features/auth/components/AuthScreen'
import { redirectIfAuthenticated } from '@/features/auth/guards'
import { validateAuthSearch } from '@/features/auth/redirect'

export const Route = createFileRoute('/login')({
  validateSearch: validateAuthSearch,
  beforeLoad: redirectIfAuthenticated,
  component: LoginRoute,
})

function LoginRoute() {
  return <AuthScreen mode="login" search={Route.useSearch()} />
}
