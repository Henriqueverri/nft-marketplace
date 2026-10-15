export const env = {
  enableMocks: import.meta.env.VITE_ENABLE_MOCKS === 'true',
  commitSha: __COMMIT_SHA__,
} as const
