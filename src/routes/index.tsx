import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { CATALOG_SEARCH_DEFAULTS, catalogSearchSchema } from '@/features/catalog/search-params'
import { HomePage } from '@/features/home/HomePage'

export const Route = createFileRoute('/')({
  validateSearch: catalogSearchSchema,
  search: { middlewares: [stripSearchParams(CATALOG_SEARCH_DEFAULTS)] },
  component: HomeRoute,
})

function HomeRoute() {
  return <HomePage search={Route.useSearch()} />
}
