import { createFileRoute } from '@tanstack/react-router'
import { CheckoutPage } from '@/features/checkout/components/CheckoutPage'

export const Route = createFileRoute('/_authenticated/checkout')({
  component: CheckoutPage,
})
