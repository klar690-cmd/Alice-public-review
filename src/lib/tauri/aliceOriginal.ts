import { isAlicePreview } from '../aliceEnvironment'
import { safeConversationUrl } from '../aliceModel'
import { openInBrowser, writeClipboardText } from './filesystem'
/** Only a deliberate click opens a saved link; no embedded page or DOM inspection. */
export async function openAliceOriginal(url: string): Promise<void> {
  const target = safeConversationUrl(url)
  if (isAlicePreview) {
    window.open(target, '_blank', 'noopener,noreferrer')
    return
  }
  await openInBrowser(target)
}
/** Call only from an explicit reviewed Copy action. */
export async function copyAliceHandoff(value: unknown): Promise<void> {
  const text = JSON.stringify(value, null, 2)
  if (isAlicePreview) {
    await navigator.clipboard.writeText(text)
    return
  }
  await writeClipboardText(text)
}
