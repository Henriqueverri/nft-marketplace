import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/login')({
  component: () => <PlaceholderPage title="Entrar" phase="F1" />,
})
