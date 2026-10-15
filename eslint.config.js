import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const mockImports = {
  group: ['msw', 'msw/*', '@mswjs/*', '@/mocks', '@/mocks/*', '**/mocks/*'],
  message: 'Mocks live on the network layer only (src/mocks). App code must not import them.',
}

const socketImports = {
  group: ['socket.io-client'],
  message: 'Use the realtime module (src/shared/realtime) instead of socket.io-client directly.',
}

export default defineConfig([
  globalIgnores([
    'dist',
    'playwright-report',
    'test-results',
    'blob-report',
    'public/mockServiceWorker.js',
    'src/routeTree.gen.ts',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // File routes export `Route` next to local components; autoCodeSplitting moves the
    // components into their own modules, so Fast Refresh keeps working.
    files: ['src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // shadcn/ui generated components export variants next to the component.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/mocks/**', 'src/shared/realtime/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [mockImports, socketImports] }],
    },
  },
  {
    files: ['src/shared/realtime/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [mockImports] }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/mocks/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'REST calls must go through the Axios client (src/shared/api/http.ts).' },
      ],
    },
  },
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts', 'vite.config.ts'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
])
