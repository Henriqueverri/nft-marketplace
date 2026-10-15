/**
 * Entry of the on-demand realtime chunk. Its own module gives the chunk a stable
 * name (`socket-client-<hash>.js`), which the mock scenario uses to make it fail.
 */
export { io } from 'socket.io-client'
