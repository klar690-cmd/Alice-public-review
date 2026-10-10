import { applyBootAppearance } from './lib/bootAppearance'
import { installAlicePreviewBridge } from './preview/bridge'

if (import.meta.env.MODE === 'alice-preview') installAlicePreviewBridge()

if (import.meta.env.DEV) {
  document.title = '(DEV) Alice'
}

// Mark the platform as soon as the bundled entry starts evaluating, before
// styles and React, to avoid an opaque first paint behind rounded macOS window
// corners. App.tsx confirms the value later; see reset.css.
document.documentElement.dataset.platform = /Macintosh|Mac OS X/i.test(navigator.userAgent)
  ? 'macos'
  : 'other'

// Paint the startup screen with the last known theme; App.tsx takes over after hydration.
applyBootAppearance()
