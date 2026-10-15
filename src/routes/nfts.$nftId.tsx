import { createFileRoute } from '@tanstack/react-router'
import { PlaceholderPage } from '@/shared/layout/PlaceholderPage'

export const Route = createFileRoute('/nfts/$nftId')({
  component: NftDetailPage,
})

function NftDetailPage() {
  const { nftId } = Route.useParams()
  return (
    <PlaceholderPage title="Detalhes do NFT" phase="F2">
      <p className="text-body-14 text-text-secondary">Identificador: {nftId}</p>
    </PlaceholderPage>
  )
}
