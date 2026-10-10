import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url)),
  root = path.resolve(dir, '../../../..')
const require = createRequire(path.join(root, 'package.json'))
const { build } = await import(
  pathToFileURL(path.join(path.dirname(require.resolve('vite/package.json')), 'dist/node/index.js'))
    .href
)
const react = (await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)).default
const outDir = path.join(dir, '.runtime/offline-build')
await build({
  configFile: false,
  root,
  mode: 'alice-preview',
  base: './',
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: false,
    sourcemap: false,
    minify: false,
    assetsInlineLimit: 64 * 1024 * 1024,
    rollupOptions: {
      input: path.join(dir, 'Alice-browser.html'),
      output: { inlineDynamicImports: true },
    },
  },
})
const htmlPath = path.join(outDir, 'docs/alice/v2/m3g/Alice-browser.html')
let html = fs.readFileSync(htmlPath, 'utf8')
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_tag, relative) => {
  const file = path.resolve(path.dirname(htmlPath), relative)
  if (!file.startsWith(outDir + path.sep) || !file.endsWith('.js'))
    throw new Error('UNEXPECTED_SCRIPT')
  const code = fs.readFileSync(file, 'utf8').replace(/<\/script/gi, '<\\/script')
  return '<script type="module">' + code + '</script>'
})
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*>/g, (tag) => {
  const relative = tag.match(/href="([^"]+)"/)?.[1]
  if (!relative) throw new Error('MISSING_STYLESHEET')
  const file = path.resolve(path.dirname(htmlPath), relative)
  if (!file.startsWith(outDir + path.sep) || !file.endsWith('.css'))
    throw new Error('UNEXPECTED_STYLE')
  return '<style>' + fs.readFileSync(file, 'utf8') + '</style>'
})
fs.writeFileSync(path.join(dir, 'Alice-V2-preview.html'), html)
console.log(
  JSON.stringify({
    html: path.join(dir, 'Alice-V2-preview.html'),
    bytes: Buffer.byteLength(html),
    source:
      'Existing src/preview/main.tsx -> src/main.tsx -> App with its native Alice V2 navigation; no custom UI',
    nativeBuild: false,
  }),
)
