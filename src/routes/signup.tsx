import { createFileRoute } from '@tanstack/react-router'
import { AuthScreen } from '@/features/auth/components/AuthScreen'
import { redirectIfAuthenticated } from '@/features/auth/guards'
import { validateAuthSearch } from '@/features/auth/redirect'

export const Route = createFileRoute('/signup')({
  validateSearch: validateAuthSearch,
  beforeLoad: redirectIfAuthenticated,
  component: SignupRoute,
})

function SignupRoute() {
  return <AuthScreen mode="signup" search={Route.useSearch()} />
}
