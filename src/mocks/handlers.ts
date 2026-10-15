import { controlHandlers } from './control'
import { socketHandlers } from './socket'

export const handlers = [...controlHandlers, ...socketHandlers]
