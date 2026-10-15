import { accountHandlers } from './api/account'
import { authHandlers } from './api/auth'
import { catalogHandlers } from './api/catalog'
import { favoriteHandlers } from './api/favorites'
import { assetHandlers } from './assets'
import { controlHandlers } from './control'
import { socketHandlers } from './socket'

export const handlers = [
  ...controlHandlers,
  ...authHandlers,
  ...accountHandlers,
  ...catalogHandlers,
  ...favoriteHandlers,
  ...assetHandlers,
  ...socketHandlers,
]
