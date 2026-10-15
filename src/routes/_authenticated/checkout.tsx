import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/_authenticated/checkout')({
  component: () => <PlaceholderPage title="Pagamento" phase="F4" />,
})
