import { accountHandlers } from './api/account'
import { authHandlers } from './api/auth'
import { assetHandlers } from './assets'
import { controlHandlers } from './control'
import { socketHandlers } from './socket'

export const handlers = [
  ...controlHandlers,
  ...authHandlers,
  ...accountHandlers,
  ...assetHandlers,
  ...socketHandlers,
]
