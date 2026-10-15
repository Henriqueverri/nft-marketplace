import { createFileRoute, Link } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <PlaceholderPage title="Início" phase="F2">
      <Link
        to="/nfts/$nftId"
        params={{ nftId: 'emerald-ape-042' }}
        className="text-body-14 text-brand-accent underline underline-offset-4"
      >
        Ver um NFT de exemplo
      </Link>
    </PlaceholderPage>
  )
}
