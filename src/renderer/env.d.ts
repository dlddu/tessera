/// <reference types="vite/client" />

import type { TesseraApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Exposed by the preload bridge (see `src/preload/index.ts`). */
    tessera: TesseraApi
  }
}

export {}
