import { createFileRoute } from '@tanstack/react-router'
import { OrderStatusPage } from '@/features/orders/components/OrderStatusPage'

export const Route = createFileRoute('/_authenticated/orders/$orderId')({
  component: OrderRoute,
})

function OrderRoute() {
  const { orderId } = Route.useParams()
  return <OrderStatusPage key={orderId} orderId={orderId} />
}
