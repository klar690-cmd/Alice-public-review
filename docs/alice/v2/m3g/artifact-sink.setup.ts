import { vi } from 'vitest'

// R262 source stays read-only; only its two evidence-file destinations are redirected.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  const write: typeof actual.writeFileSync = (file, data, options) => {
    const name = typeof file === 'string' ? file.split('\\').join('/') : ''
    const targets: Record<string, string> = {
      'docs/alice/v2/m3bc/FIXTURE_CHAIN.json':
        'docs/alice/v2/m3g/r262-regression/FIXTURE_CHAIN.json',
      'docs/alice/v2/m3bc/FIXTURE_N8N_IR.json':
        'docs/alice/v2/m3g/r262-regression/FIXTURE_N8N_IR.json',
    }
    if (Object.prototype.hasOwnProperty.call(targets, name)) {
      actual.mkdirSync('docs/alice/v2/m3g/r262-regression', { recursive: true })
      return actual.writeFileSync(targets[name], data, options)
    }
    return actual.writeFileSync(file, data, options)
  }
  return { ...actual, writeFileSync: write, default: { ...actual.default, writeFileSync: write } }
})
