import { defineConfig, devices } from '@playwright/test'

const deployTarget = process.env.E2E_TARGET === 'deploy'
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL

if (deployTarget && !externalBaseURL) {
  throw new Error('E2E_TARGET=deploy requires PLAYWRIGHT_BASE_URL (the public Vercel URL).')
}

const localBaseURL = 'http://localhost:4173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalBaseURL ?? localBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'allow',
    locale: 'pt-BR',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: localBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
})
