import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    // Keep the dev server and the Tauri webview on the same IP family.
    host: '127.0.0.1',
    port: 1422,
    strictPort: true,
    // Do not watch native build output while the linker is writing it.
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    sourcemap: false,
    outDir: mode === 'alice-preview' ? '.preview' : 'dist',
    assetsInlineLimit: mode === 'alice-preview' ? 32 * 1024 * 1024 : 4096,
    minify: mode === 'alice-preview' ? false : 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      input: mode === 'alice-preview' ? 'Alice-preview-R213.html' : 'index.html',
      output: {
        inlineDynamicImports: mode === 'alice-preview',
        manualChunks:
          mode === 'alice-preview'
            ? undefined
            : {
                xterm: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-search'],
                react: ['react', 'react-dom'],
                mermaid: ['mermaid'],
                cytoscape: ['cytoscape'],
                markdown: ['react-markdown', 'remark-gfm'],
              },
      },
    },
  },
}))
