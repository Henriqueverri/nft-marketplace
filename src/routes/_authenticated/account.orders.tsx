import { createFileRoute } from '@tanstack/react-router'
import { OrderHistoryPage } from '@/features/orders/components/OrderHistoryPage'

export const Route = createFileRoute('/_authenticated/account/orders')({
  component: OrderHistoryPage,
})
