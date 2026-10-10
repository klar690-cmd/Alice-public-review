# R271 final test matrix

Source **7c61693a0345252996a7f4f6ed673e639ce14fb0**. **446/446** integrated tests in21 files; 439 prior +7 new, no subset double counting. Types/noEmit, scoped lint zero warnings, format and source diff PASS. Native tests NOT_RUN.

| File | Passed / total |
| --- | --- |
| src/securityPolicy.test.ts | 6 / 6 |
| src/lib/agentRuntimeAdapter.test.ts | 4 / 4 |
| src/lib/aliceBinding.test.ts | 4 / 4 |
| src/lib/aliceModel.test.ts | 5 / 5 |
| src/lib/alicePersistence.test.ts | 8 / 8 |
| src/lib/experimentalAgentPolicy.test.ts | 15 / 15 |
| src/lib/sessionLaunch.test.ts | 11 / 11 |
| src/components/AliceV2/AccountsPanel.test.tsx | 3 / 3 |
| src/components/AliceV2/ProviderSettings.test.tsx | 14 / 14 |
| src/components/AliceV2/useNavigation.test.tsx | 7 / 7 |
| src/components/AliceV2/Workspace.test.tsx | 5 / 5 |
| src/lib/aliceV2/livePlan.test.ts | 13 / 13 |
| src/lib/aliceV2/m1.test.ts | 72 / 72 |
| src/lib/aliceV2/providerUiOptions.test.ts | 37 / 37 |
| src/lib/aliceV2/runIntentBridge.test.ts | 61 / 61 |
| src/lib/aliceV2/securityPolicy.test.ts | 67 / 67 |
| src/lib/aliceV2/uiAdapter.ui.test.ts | 15 / 15 |
| src/lib/aliceV2/n8nOffline/batch.integration.test.ts | 6 / 6 |
| src/lib/aliceV2/n8nOffline/ir.test.ts | 20 / 20 |
| src/lib/aliceV2/offlineAdapters/adapter.test.ts | 45 / 45 |
| src/lib/aliceV2/offlineCoordinator/coordinator.test.ts | 28 / 28 |

New cases: editable unavailable account/API preferences without availability claims; actual inspector GG/worker independence; new agent/provider reset; save/load/duplicate; real navigation profile/project isolation; blocked preferences cannot cross the immutable bridge; numeric/long native profile IDs map to distinct valid graph-only namespaces.

Final browser: 27 real checks, 9 actual images, no external HTTP/page errors/auth popup. Existing full App entry/native navigation, not the fixed-store old preview. Existing-profile tests used two isolated local profile fixtures; the separate creation regression clicked the original local-profile form with a deterministic numeric-leading UUID and completed normally. Real accounts/credentials were never read.

Optional offline HTML was rebuilt from the final source, then actual file:// GG/API and worker/account-unavailable clicks passed with external network blocked. Launcher start/stop/start and HTTP200/listener127.0.0.1 receipt: LAUNCHER_RESULTS.json.

R262 integrated test source is unchanged. Only its two old evidence output paths are redirected by artifact-sink.setup.ts to m3g/r262-regression; real fixtures/policy/coordinator/IR assertions run unchanged. No native certification follows from this harness.

Initial checks recorded one duplicate UI caption selector, an optional protected sidebar-close overlap, required input before saving a new node, selector names/selection context assumptions, and the confirmed numeric-profile ID failure. Those were investigated; no graph validator, account manager, Home or native guard was weakened. Routing/profile/launcher fixes are in the exact final candidate. Final runs all pass.

Computer-use initialization failed with trusted kernel process exit. Prior explicit user permission for isolated Chrome headless was reused. No personal browser or new dependency.
