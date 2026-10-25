import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

process.env.MONGOMS_DOWNLOAD_DIR = fileURLToPath(new URL('./.cache/mongodb-binaries/', import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
