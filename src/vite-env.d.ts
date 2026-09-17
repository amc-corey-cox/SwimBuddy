/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Set to 'true' only for preview builds, so PR previews render the synthetic
   * store. Production builds leave it unset and tree-shake the fixtures away.
   */
  readonly VITE_SHOW_FIXTURES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
