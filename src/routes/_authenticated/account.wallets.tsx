import { createFileRoute } from '@tanstack/react-router'
import { WalletsPage } from '@/features/wallets/components/WalletsPage'

export const Route = createFileRoute('/_authenticated/account/wallets')({
  component: WalletsPage,
})
