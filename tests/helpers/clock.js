// Install before the first navigation when a test needs deterministic Date/timers.
export async function freezeTime(page, iso = '2026-01-15T12:00:00.000Z') {
  await page.clock.install({ time: new Date(iso) })
}

export async function advanceTime(page, milliseconds) {
  await page.clock.fastForward(milliseconds)
}
