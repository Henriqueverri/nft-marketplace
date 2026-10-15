import { accountHandlers } from './api/account'
import { authHandlers } from './api/auth'
import { cartHandlers } from './api/cart'
import { catalogHandlers } from './api/catalog'
import { favoriteHandlers } from './api/favorites'
import { orderHandlers } from './api/orders'
import { walletHandlers } from './api/wallets'
import { assetHandlers } from './assets'
import { controlHandlers } from './control'
import { socketHandlers } from './socket'

export const handlers = [
  ...controlHandlers,
  ...authHandlers,
  ...accountHandlers,
  ...catalogHandlers,
  ...favoriteHandlers,
  ...cartHandlers,
  ...orderHandlers,
  ...walletHandlers,
  ...assetHandlers,
  ...socketHandlers,
]
