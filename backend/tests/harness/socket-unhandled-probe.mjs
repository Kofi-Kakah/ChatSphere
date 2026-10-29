// Runs in a child process: proves whether malformed socket payloads produce
// unhandled promise rejections in the server's async event handlers.
import { startTestDatabase } from '../helpers/db.js'
import { startTestServer } from '../helpers/server.js'
import { createDirectConversation, createUser, idOf } from '../helpers/factories.js'
import { connectReady } from '../helpers/socket.js'

const rejections = []
process.on('unhandledRejection', (reason) => {
  rejections.push(String(reason?.message ?? reason))
})

const db = await startTestDatabase('socket-crash-probe')
const server = await startTestServer()
const alice = await createUser(server.config)
const bob = await createUser(server.config)
const conversation = await createDirectConversation(alice.user, bob.user)

const aliceSocket = (await connectReady(server.url, alice.token)).socket
const bobSocket = (await connectReady(server.url, bob.token)).socket

bobSocket.emit('message:delivered', {
  conversationId: idOf(conversation),
  messageId: 'not-an-object-id',
})
bobSocket.emit('message:read', {
  conversationId: idOf(conversation),
  messageId: 'not-an-object-id',
})
aliceSocket.emit('typing:start', { conversationId: 'not-an-object-id' })

await new Promise((resolve) => setTimeout(resolve, 1500))

console.log(JSON.stringify({ unhandledRejections: rejections }))

aliceSocket.disconnect()
bobSocket.disconnect()
await server.stop()
await db.stop()
process.exit(rejections.length === 0 ? 0 : 1)
