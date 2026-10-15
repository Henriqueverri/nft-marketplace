import { createFileRoute } from '@tanstack/react-router'
import { NftDetailPage } from '@/features/catalog/components/NftDetailPage'
import { nftDetailQueryOptions } from '@/features/catalog/queries'

export const Route = createFileRoute('/nfts/$nftId')({
  // Starts the request on intent (hover/focus of a card) without blocking navigation:
  // the page itself renders loading, not-found and error states.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(nftDetailQueryOptions(params.nftId))
  },
  component: NftDetailRoute,
})

function NftDetailRoute() {
  const { nftId } = Route.useParams()
  return <NftDetailPage nftId={nftId} />
}
