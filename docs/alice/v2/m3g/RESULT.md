# R271 — actual Alice browser App with independent provider/account/API preferences

TASK: PHASE_ASSISTENTE_R271_ALICE_ACTUAL_BROWSER_HTML_PER_AGENT_PROVIDER_ACCOUNT_API_VIEW_V1

REVISION: 1 · GENERATION: 84 · SESSION: ASSISTENTE-20261010-ALICE-BROWSER-PROVIDER-AUTH-VIEW-01

BASE: **953dc0fe8120bd6722274b1a4994fe1410349baa**

FUNCTIONAL_CANDIDATE: **7c61693a0345252996a7f4f6ed673e639ce14fb0**

BRANCH: alice/v2-m3g-real-browser-agent-provider-auth-view-v1

RESULT: **DONE — actual localhost App and working same-App offline HTML, UI configuration only**

[Open the local Alice App](http://127.0.0.1:1448/docs/alice/v2/m3g/Alice-browser.html). See OPEN_IN_BROWSER.md and Open-Alice.cmd for one-command reopening and safe stop. The task leaves its own loopback server running.

| Checkpoint | Outcome |
| --- | --- |
| A | PASS: existing App/node editor, labeled Agents & connections navigation, two visible account/API choices, independent GG/worker/project/team/profile UI preferences |
| B | PASS: real HTTP200 localhost route, tested own-process launcher, same full App bundled and tested from file:// |
| C | PASS producer: 446 integrated offline frontend tests, 27 actual Chrome checks, nine real screenshots, type/lint/format/diff and protected-file integrity |

## What changed

The existing inspector now starts with **Qual IA será este agente?** and **Como deseja conectar?**. Its account/API buttons edit only the selected node's preference, visibly highlight it, and disclose unsupported/pending connection status. Account preferences can be recorded without claiming availability: capability status stays UNAVAILABLE and the **unchanged** runIntentBridge rejects that method. Unsupported API preferences also remain denied by the bridge. Native CLI/cloud restrictions are not relaxed. Provider changes clear the previous method back to simulation.

The real App's old navigation replacement invoked the editor but retained the protected sidebar's Accounts label. The existing optional navigation slot now exposes **Agentes e ligações** with its usual icon style, while original Accounts stays intact. No App, sidebar implementation, global route, Home or account-manager file was edited. The inspector moves company/method choices above secondary fields and resets its scroll when changing node/team/project context.

The former preview entry mounted an external fixed M2 store and mainOverride. R271 hosts the **existing standard App entry** instead: Alice-browser.html → src/preview/main.tsx → src/main.tsx → App → normal useAliceV2Navigation. This restores actual project/profile context routing. No copied app, alternative editor, Storybook or detached mock UI was introduced. The existing browser-only adapter and original safety notice are preserved; its local sample metadata is not a live provider account.

Actual profile creation exposed another boundary: native UUIDs may begin with digits while M1 graph IDs must begin with a letter. The authorized navigation layer now derives a stable short **graph-only** profile namespace with the existing SHA-256 function. Real account IDs, profile manager, storage, M1 validator and all native policies remain untouched. Project/profile stores stay isolated; this does not mint a trusted identity or grant. Both existing-profile switching and real local-profile creation with a numeric-leading UUID were tested through the original UI.

## Delivery and security

Open-Alice.ps1/cmd use cached Node/Vite, bind only 127.0.0.1:1448, reject foreign port/PID ownership, stop only their own server and wait for termination before reopening. No other server is restarted or killed. The optional ~31.5 MB Alice-V2-preview.html is a single-file build of the same App/assets, with account/API clicks tested under file:// and no external HTTP. Source build configuration/dependencies were not changed; only the optional cached frontend bundler was used. No native/Windows executable build.

All preferences keep connected:false/executable:false. No API key/password input, provider login, OAuth popup, provider/model request, CLI worker, native IPC grant, n8n execution, paid service, Actions, Rust/Cargo, dependency install, public/LAN hosting, default promotion or Android edit. Legacy simulations remain fake.message and offline IR remains nondeployable. Team preferences remain session memory; reloading resets those drafts, as the existing UI clearly states.

27 browser checks include Home/name, actual agent route, GG OpenAI/API, worker Anthropic/account unavailable, new Google Antigravity worker, provider reset, manual port drag before save, team/project/profile separation and restoration, original theme picker, narrow layout, inspector visibility, original Accounts, Home return, offline flow and numeric-profile creation. Zero page errors/external HTTP in the final run. The tests used isolated local fixtures; no personal browser/account was accessed.

446/446 in 21 test files includes the previous 439 plus **seven** new cases; focused runs are subsets, not added. 10 allowed source/test files plus five browser entry/launcher/export support files form the functional candidate. Later evidence-only HEAD is recorded in canonical ASSISTENTE_LATEST and immutable report. All 17 original protected files and all unlisted source/workflows/native/locks/assets/themes remain unchanged. Producer evidence is not independent native QA or user visual signoff.

## RESUMO_PARA_GG

R271 rev1/gen84 DONE/PARKED/NONE. Actual owner-openable App route and same-App offline HTML delivered, 446 frontend tests/27 browser checks/nine true PNGs. Review the company/account/API preference seam, native navigation extension and graph-only profile-ID namespace; runIntentBridge source/native/core/account IDs remain unchanged. Local server remains available with a safe one-command launcher. No provider/native/auth/cost/Actions/default or next-task activation. R269 financial/native gates remain blocked and separate.
