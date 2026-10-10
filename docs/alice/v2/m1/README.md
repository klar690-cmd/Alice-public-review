# Alice V2 M1 — graph contracts and fake handoff

This is a self-contained TypeScript domain prototype, not a UI or live runtime. The exact functional base is R240 `21ddb4f7036bf5e85f7ecb442d3a71cbd2896ecf`; the isolated branch is `alice/v2-m1-graph-contracts-fake-handoff-v1`. Existing Alice/Alethe source, themes, assets, licensing, settings, workflows and default branch remain unchanged. The original 17 unpublished theme files remain protected.

## Modules

| New module | Responsibility |
| --- | --- |
| contracts.ts | Versioned graph, scope, agent/port/control/data edge, run snapshot, logical sessions, fake grants, messages, trace/checkpoint/result and stable error codes |
| validate.ts | Strict bounded JSON data validation; canonical graph normalization; safe pure import/export; ownership, graph/port/dependency/budget/output/grant checks |
| compile.ts | Pure canonical SHA-256 and stable topological planning descriptor, explicitly `SIMULATION_ONLY`, non-executable and unpublished |
| fakeExecutor.ts | Deterministic fake sessions and schema-checked A→B exchange; immutable trace, approvals/denials, bounded retries/budgets, cancellation and explicit checkpoint recovery |
| m1.test.ts | Positive and adversarial cases, hash reference vectors, isolated fixtures, forbidden-API AST/runtime checks and optional test-harness evidence capture |

No production module imports a provider, Tauri, filesystem, network, clock, timer, environment, random source or external library. The test runner alone uses existing Node/TypeScript tooling. The fake implementation accepts explicit logical ticks and fixture fault controls; it cannot launch a session or perform a real action.

## Definition, run and session separation

GraphDocument schema v1 contains owner/profile/config scope, integer revision, agents and typed ports, separate control/data edges and a known finite budget. A profile may contain multiple configs: two independent definitions round-trip through pure JSON in the tests. Per-node scope must match the graph; identifiers, references, schemas and budgets are checked before planning. Only `fake` / `fake.message` providers are accepted. Real providers, executable/credential/endpoint fields, invalid joins, cycles and unsupported versions fail closed.

`compileGraph` validates and normalizes input ordering before hashing, so equivalent definitions produce the same plan. Revisions, scopes, prompts and budgets are part of the digest. SHA-256 uses a pure UTF-8 implementation tested against installed Node reference hashes. No clocks, native crypto or environment reads are used by the domain layer.

Each RunIdentity binds run/correlation IDs, scope, revision and full graph digest. A RunSnapshot retains that identity and the immutable planning descriptor. Each agent gets a separately derived fake session ID. Display roles and message content are data; they do not modify policy.

## Descriptive n8n mapping

The descriptor is **`alice.n8n-shaped-plan.v1` intermediate representation**, not n8n import JSON. It has `mode: SIMULATION_ONLY`, `executable: false`, `workflowPublished: false`, a simulated manual trigger and ordered steps. Each step describes wait-for-dependencies, fake-grant check, fake-agent invocation and output validation; typed receive edges carry source/target ports.

There are no active webhooks, endpoints, credentials, executable scripts, n8n node implementations or create/update/publish requests. An Alice node may eventually map to several backend steps. M3/M4 must validate a versioned adapter, deploy/API capabilities, authentication, approval and execution receipts; M1 proves none of those runtime interfaces. n8n remains the owner's primary future workflow engine, while Alice will retain the trusted local executor boundary.

M1 supports acyclic control flow and explicit `all` joins with one source per input port. Arbitrary conditions/loops, alternate join semantics, UI editing, native execution and real persistence are deliberately unsupported; they require later contracts rather than silent schema widening.

## Fake authority, replay and recovery

FakeGrant carries a decision, explicit simulated action, identity/digest and logical validity interval. Missing grant waits; denied, expired, mismatched or live-access grants produce no invocation. Every handoff/output is schema and scope checked. Adversarial text remains literal message data. All results say `realAccess: false`; **an approved fake grant is not a credential, signature, OS authorization or proof of user consent**.

Checkpoints are pure JSON snapshots with an integrity digest, immutable history and one fake receipt per run/node. Duplicate event acknowledgements do not append events or repeat messages. Interrupted work needs explicit resume. A committed fake receipt is reused after an after-effect interruption; saved running/queued work hydrates as interrupted rather than a nonexistent live agent. Clock values never rewind at recovery. Failures remain failed without implicit retry; retry counts and steps/ticks are bounded.

Checkpoint SHA-256 detects inconsistent/corrupt content; it does **not** authenticate a caller who can rewrite a checkpoint and its digest. Native journal integrity and durable external-effect reconciliation belong to M3/M4. Secret/field guards and JSON validation are not universal DLP or a sandbox for hostile JavaScript Proxy objects. Public import accepts bounded JSON text; no plugin code or callbacks are executed. Tests cover ordinary accessors, custom prototypes, hidden fields and malformed Unicode.

## Reproduce with existing tools only

From the repository root, using the already installed dependency tree:

```text
node node_modules/vitest/vitest.mjs run src/lib/aliceV2/m1.test.ts --maxWorkers=1 --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/lib/aliceV2
```

A separate strict TypeScript invocation includes the five new files and their tests, with ES2020/Bundler resolution and existing Node/Vitest types; exact invocation is recorded in the producer report. No package install, lock/config change, native/frontend production build or CI is required by M1.

The optional `ALICE_M1_EVIDENCE_ROOT` test-harness variable may name exactly `docs/alice/v2/m1/evidence` under the repository root. The test harness then writes `simulation.json` containing synthetic definitions, plan and real results of the fake simulation. The four domain modules never read that environment variable or write files.

Producer evidence is not independent QA or proof of real n8n/CLI functionality. M2 UI, M3 native broker/storage and M4 real providers/n8n need separately authorized tasks. The held R245 Windows workflow is not published or run here. No release, executable, PR, paid service or next phase is started.
