# Alice R213 / R214 first milestone

Status: implementation and browser preview validated by producer; user/GG visual review pending.

Alice starts at Alethe v1.7.0, exact commit `7f0288c98098bda2c859d4065733aa6e9b4b74f9`,
with upstream history, LICENSE, NOTICE and trademark policy retained. The development
branch is `alice/r213-alethe-fork-v1` in the private `klar690-cmd/Alice` repository.
This milestone adds separate account / logical-agent / session metadata through the
original plugin host. Existing PTY/provider adapters and project migrations remain intact.

## Fidelity and integration

- All 116 existing CSS files and the selected pane/sub-tab/ASCII implementation files are unchanged.
- The original decorative Home artwork and motion parameters are retained. Alice has separate app
  identifiers, name, app icons and a monogram. Internal upstream protocol/plugin IDs stay compatible.
- Connections uses the existing sidebar contribution, Radix Modal, controls and theme tokens.
- The agent pane composes existing pane chrome/SubTabsLane within the original workspace grid.
- Account metadata is stored independently of projects.json (unchanged version 9) under Alice-specific
  localStorage keys. It is app-wide metadata in this first slice, not a per-profile credential store.
- Native data directories are separated as Alice. Independently signed Alice updates are unavailable;
  upstream updater endpoints are disabled so this fork cannot install an upstream binary as Alice.
- Closed native surfaces support metadata, Open Original and canonical references only. No private
  chat scraping, authenticated session import or API-key requirement is introduced.
- n8n connection state and routing are explicitly simulated event contracts. No webhook is sent.

## Validation

- `npm ci`: pass from upstream lockfile. Existing dependency advisories were not force-fixed.
- Baseline upstream frontend build: pass. Baseline lint: 0 errors / 167 warnings.
- Final `npm run build`: pass (TypeScript/i18n + production Vite). Existing large-chunk warning remains.
- Final `npm run preview:build`: pass; actual React frontend/CSS/font/image assets inlined into one HTML.
- 6 relevant test files / 83 tests pass: Alice model, plugin host, security policy, project migrations,
  project grids and provider registry.
- Final lint: 0 errors / 167 warnings, matching upstream. Generated .preview output excluded like dist.
- `git diff --check`: pass. LICENSE unchanged in Git; upstream copyright notices preserved.
- Browser smoke on compiled HTML served by localhost: pass. Final error/warning console snapshot: empty.
- Home, groups/projects, account-to-GG/ARTE/ARTE_2, multi-pane/session tabs, n8n disconnected/simulated
  connected, event session binding, account/agent creation, invalid credential-bearing URL rejection,
  metadata reload persistence and restore-demo were exercised. Screenshots are included.
- Direct file:// browser testing was denied by the browser URL policy; no bypass was attempted. The
  self-contained packaging is checked and HTTP smoke-tested; direct file opening remains user verification.
- Rust/Cargo/MSVC are absent; native Tauri compilation/PTY execution cannot be attested on this PC.
- Graphify graph/CLI are absent; the requested `graphify update .` could not execute.
- Disk remained above the 5 GB hard floor. No emulator/G3 or game product changes occurred.

## Preview and limits

The HTML preserves the real Alethe shell and effects with deterministic, clearly labelled preview data.
It cannot launch native PTYs, access credentials/files/private conversations or dispatch live n8n tasks.
A disabled original terminal shows the desktop-only boundary. Other native actions fail closed in preview.
Newly created agents are metadata-only/idle; live session creation/binding UI and provider-native histories
are later milestones. Account and session abstractions do not claim an existing authenticated connection.

Download the HTML, portable package, corresponding source and checksums from
https://github.com/klar690-cmd/Alice/releases/tag/alice-preview-r213.
Exact HTML hash/bytes and screenshot hashes are in validation.json; artifact candidate provenance is in
release-manifest.json on the prerelease. The source ZIP includes build scripts, assets, license and notices.

## Next owner

GG/user: test the HTML and review visual fidelity. ASSISTENTE/WORK is parked after publication.
Deeper official provider APIs, PTY account/session binding, secure credential lifecycle, native packaging
and live n8n integration require the next canonical task; no further provider work starts here.
