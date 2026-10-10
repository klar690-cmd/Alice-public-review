# Alice V2 M2 — opt-in visual demonstration

This prototype starts on the existing classic Alice Home. The preferred-name step, greeting, large animated ASCII A, original panes, and theme implementation remain unchanged. Only this isolated browser preview supplies an explicit **Enter Alice V2 demo** button. Leaving the demonstration returns to the classic Home. Reloading resets the V2 session and keeps V2 off.

From this branch, with the already available dependencies:

```powershell
node node_modules/vite/bin/vite.js --config src/preview/aliceV2/vite.config.ts --mode alice-preview
```

Open `http://127.0.0.1:1436/src/preview/aliceV2/index.html`. The separate unchanged classic preview is `http://127.0.0.1:1436/src/preview/aliceV2/classic.html`.

The V2 workspace offers one GG conversation, a CSS/SVG node canvas with inspector, two team presets, cloning and saving/restoring within the current demo session, and playback of captured M1 simulation events. Nodes support pointer dragging and arrow-key movement; canvas controls support keyboard panning, zoom and fit. Outputs and inputs create typed connections subject to M1 validation. Invalid drafts cannot be saved or simulated. Graph changes do not alter the captured execution snapshot or its bound fake approval.

Provider and capability are restricted to `fake` / `fake.message`. The inspector edits labels, roles, test instructions and produce/review behavior. Join policy is the existing M1 `all`. No real provider, external account, PTY, workflow, durable project storage, or n8n service is connected. GG replies are explicitly labeled local samples. The synchronous pure executor produces events; UI stepping is replay, not a live worker.

The preview imports the existing classic browser fixture bridge only for classic Home. M2 state and its adapter do not import native, network or storage adapters. Existing classic files, M1 contracts/executor, themes, packages, locks and native code are untouched. No App or feature-flag change was necessary. English, Brazilian Portuguese and Chinese messages are scoped to the new allowlisted component tree.

Verification uses the existing Vitest, TypeScript, ESLint and frontend Vite caches. The new preview build configuration emits browser assets into a sibling temporary directory, never a Windows application or executable. See `PREVIEWS.md` and `RESULT.md` for exact source provenance, actual browser screenshots and limitations. User visual acceptance and independent QA remain separate gates.
