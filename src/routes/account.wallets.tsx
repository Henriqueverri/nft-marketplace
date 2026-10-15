import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/account/wallets')({
  component: () => <PlaceholderPage title="Carteiras" phase="F5" />,
})
