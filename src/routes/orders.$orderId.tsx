import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/orders/$orderId')({
  component: () => <PlaceholderPage title="Confirmação de pedido" phase="F4" />,
})
