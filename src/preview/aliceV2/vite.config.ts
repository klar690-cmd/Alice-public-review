import { resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/** Isolated frontend preview, using cached tools; no package/config changes to classic Alice. */
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { host: '127.0.0.1', port: 1436, strictPort: true },
  build: {
    outDir: resolve(process.cwd(), '../preview-build'),
    assetsInlineLimit: 32 * 1024 * 1024,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: 'src/preview/aliceV2/index.html',
      output: { inlineDynamicImports: true },
    },
  },
})
