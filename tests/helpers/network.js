// Chromium-only network conditioning via CDP. Use for slow-network and offline states.
export async function throttleSlow3G(context) {
  const page = context.pages()[0] ?? (await context.newPage())
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 400,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
  })
  return {
    reset: () =>
      session.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      }),
    detach: () => session.detach(),
  }
}

export async function setOffline(context, offline) {
  const page = context.pages()[0] ?? (await context.newPage())
  const session = await context.newCDPSession(page)
  await session.send('Network.enable')
  const set = (value) =>
    session.send('Network.emulateNetworkConditions', {
      offline: value,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
  await set(offline)
  return { set, detach: () => session.detach() }
}
