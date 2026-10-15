import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/account/profile')({
  component: () => <PlaceholderPage title="Perfil do colecionador" phase="F5" />,
})
