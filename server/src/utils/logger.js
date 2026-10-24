function write(level, event, details = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  })

  if (level === 'error') {
    console.error(entry)
  } else {
    console.log(entry)
  }
}

export const logger = {
  info: (event, details) => write('info', event, details),
  error: (event, details) => write('error', event, details),
}
