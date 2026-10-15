import { z } from 'zod'

/** Page-based pagination (1-based). Used by the catalog listing from F2 on. */
export function paginatedSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
}

export type Paginated<TItem> = {
  items: TItem[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}
