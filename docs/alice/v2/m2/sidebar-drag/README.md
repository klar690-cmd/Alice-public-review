# Owner-authorized sidebar and port-drag follow-up

The owner directly requested and authorized these two adjustments on 2026-10-09. Continue from the published R251 M2 candidate, on isolated branch `codex/alice-v2-sidebar-drag`. This is not M3 or live-agent integration. The GG subsequently held its duplicate R252 task in favor of this already-running owner assignment.

The original personalized Home and animated ASCII A remain the startup screen. A first-class **Agents & connections / Agentes e ligações** icon is integrated into both existing sidebar navigation variants. It opens the M2 editor in the existing Alice main-content area. The original sidebar and title bar stay mounted. Home navigation or leaving the demo returns to Home. Browser Back/Forward work within the demo; reload starts with Home and V2 off.

Conversa, Editor de nós, Equipes and Andamento remain available. The redundant floating entry is removed from this prototype; the embedded V2 header is reduced to a small toolbar, and its team pane can collapse. Teams and graph state remain in memory when switching views; reload is not durable storage.

Drag an output circle to an input circle. A pending line follows the pointer and highlights the hovered input; release completes the typed connection. Release on empty canvas or Escape cancels the pending line. Keyboard output-then-input selection remains available. Incomplete wiring is accepted as UI draft only: structural M1 checks still reject cycles, duplicate input ownership, schema and scope errors. Full validation remains required by Save and simulated execution. The M1 contracts, validator, compiler, executor and existing UI adapter are unchanged.

The browser-only source preview remains `http://127.0.0.1:1436/src/preview/aliceV2/index.html` with the existing cached Vite configuration. See PREVIEWS.md for the downloadable self-contained HTML, actual unedited browser screenshots, source SHA, viewport/theme provenance and checks. No dependency, native executable, real provider, n8n, project migration or default-branch change is included.

## Unreleased

- Embedded the M2 editor behind the existing left navigation rail, preserving Home and native default behavior when the optional navigation extension is absent.
- Added direct pointer-drag port connections with a visible pending wire, cancellation, keyboard fallback and incremental draft assembly.
- Preserved sample presets, saved graph snapshots, fake-only approvals and existing theme tokens.
