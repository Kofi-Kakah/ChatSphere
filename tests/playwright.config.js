import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { fakeMediaLaunchOptions, mediaPermissions } from './helpers/media.js'

const frontendDir = fileURLToPath(new URL('../frontend', import.meta.url))
const harnessPath = fileURLToPath(new URL('../backend/tests/harness/e2e-server.js', import.meta.url))
const downloadDir = fileURLToPath(new URL('../backend/.cache/mongodb-binaries/', import.meta.url))
const apiUrl = 'http://127.0.0.1:3101/api'

export default defineConfig({
  testDir: '.',
  testMatch: [
    'e2e/**/*.spec.js',
    'a11y/**/*.spec.js',
    'visual/**/*.spec.js',
    'exploratory/**/*.spec.js',
  ],
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: '../playwright-report' }],
  ],
  outputDir: '../test-results',
  use: {
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: mediaPermissions,
        launchOptions: fakeMediaLaunchOptions,
      },
    },
    {
      name: 'firefox',
      testMatch: 'e2e/**/*.spec.js',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      testMatch: 'e2e/**/*.spec.js',
      // WebKit runs multi-context flows near the 60s mark and is slow closing contexts.
      timeout: 120_000,
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: [
    {
      command: `node "${harnessPath}"`,
      url: `${apiUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, MONGOMS_DOWNLOAD_DIR: downloadDir, E2E_PORT: '3101' },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5175 --strictPort',
      cwd: frontendDir,
      url: 'http://127.0.0.1:5175',
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, VITE_API_BASE_URL: apiUrl },
    },
  ],
})
