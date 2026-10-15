/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" enables the MSW worker (REST + Socket.IO mocks). The demo deploy ships with it on. */
  readonly VITE_ENABLE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Commit the bundle was built from (Vercel's VERCEL_GIT_COMMIT_SHA, or "local"). */
declare const __COMMIT_SHA__: string
