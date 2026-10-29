import net from 'node:net'

// TCP proxy used to simulate a database outage without stopping mongod: while
// paused, existing connections are destroyed and new ones are refused.
export async function startTcpProxy(targetPort) {
  let paused = false
  const connections = new Set()

  const server = net.createServer((client) => {
    if (paused) {
      client.destroy()
      return
    }

    const upstream = net.connect({ port: targetPort, host: '127.0.0.1' })
    connections.add(client)
    connections.add(upstream)

    const cleanup = () => {
      connections.delete(client)
      connections.delete(upstream)
      client.destroy()
      upstream.destroy()
    }

    client.on('error', cleanup)
    upstream.on('error', cleanup)
    client.on('close', cleanup)
    upstream.on('close', cleanup)
    client.pipe(upstream)
    upstream.pipe(client)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  function cutConnections() {
    for (const connection of connections) connection.destroy()
    connections.clear()
  }

  return {
    port: server.address().port,
    pause() {
      paused = true
      cutConnections()
    },
    resume() {
      paused = false
    },
    async close() {
      paused = true
      cutConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
