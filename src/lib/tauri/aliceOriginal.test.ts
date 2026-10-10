import { beforeEach, describe, expect, it, vi } from 'vitest'

import { copyAliceHandoff,openAliceOriginal } from './aliceOriginal'
import { openInBrowser, writeClipboardText } from './filesystem'
vi.mock('./filesystem', () => ({
  openInBrowser: vi.fn(async () => {}),
  writeClipboardText: vi.fn(async () => {}),
}))
describe('Explicit original-surface / manual clipboard actions', () => {
  beforeEach(() => vi.clearAllMocks())
  it('opens exact safe URL through existing system browser action, never an embed', async () => {
    await openAliceOriginal('https://example.com/c/synthetic?view=all')
    expect(openInBrowser).toHaveBeenCalledWith('https://example.com/c/synthetic?view=all')
  })
  it('unsafe URL never reaches native opening', async () => {
    await expect(openAliceOriginal('javascript:alert(1)')).rejects.toThrow()
    expect(openInBrowser).not.toHaveBeenCalled()
  })
  it('copies a reviewed structured request only when invoked', async () => {
    expect(writeClipboardText).not.toHaveBeenCalled()
    await copyAliceHandoff({ manual_relay_required: true, execution_authorized: false })
    expect(writeClipboardText).toHaveBeenCalledWith(
      JSON.stringify({ manual_relay_required: true, execution_authorized: false }, null, 2),
    )
  })
})
