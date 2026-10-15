import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/signup')({
  component: () => <PlaceholderPage title="Criar conta" phase="F1" />,
})
