import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/account/favorites')({
  component: () => <PlaceholderPage title="Lista de interesse" phase="F2" />,
})
