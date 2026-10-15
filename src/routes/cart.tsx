import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/cart')({
  component: () => <PlaceholderPage title="Carrinho de NFTs" phase="F3" />,
})
