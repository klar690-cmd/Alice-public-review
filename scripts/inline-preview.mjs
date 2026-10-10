import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
const root = resolve('.preview')
let html = await readFile(resolve(root, 'Alice-preview-R213.html'), 'utf8')
for (const match of [
  ...html.matchAll(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g),
]) {
  const file = resolve(root, match[1].replace(/^\//, ''))
  const script = (await readFile(file, 'utf8')).replaceAll('</script', '<\\/script')
  html = html.replace(match[0], () => `<script type="module">${script}</script>`)
}
for (const match of [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const file = resolve(root, match[1].replace(/^\//, ''))
  const css = (await readFile(file, 'utf8')).replaceAll('</style', '<\\/style')
  html = html.replace(match[0], () => `<style>${css}</style>`)
}
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '')
await writeFile(resolve(root, 'Alice-preview-R213.html'), html, 'utf8')
const source = ['LICENSE', 'NOTICE', 'UPSTREAM.md']
for (const name of source) await writeFile(resolve(root, name), await readFile(name))
console.log('Portable Alice preview:', basename(root), html.length, 'characters')
console.log('Build assets:', (await readdir(resolve(root, 'assets'))).length)
