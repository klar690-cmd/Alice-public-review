# Alice upstream and licensing

Alice is a separately branded derivative of Alethe Agents, not an official Alethe release.

- Upstream: https://github.com/Kc1t/alethe-agents
- Exact starting commit: `7f0288c98098bda2c859d4065733aa6e9b4b74f9`
- Upstream package: `alethe`, version `1.7.0`
- License: **AGPL-3.0-or-later**. The upstream LICENSE and copyright notices remain intact.
- Original author: Kauã Miguel and Alethe contributors, as recorded in NOTICE.
- Alice repository: https://github.com/klar690-cmd/Alice

The upstream Git history is preserved, with an `upstream` remote. Internal `alethe-plugin`
protocols, plugin IDs and interoperable CLI markers remain compatibility interfaces, not a claim
that Alice is an official Alethe product. Alice uses its own name, monogram and app identifier.

## R213 milestone

Accounts, logical agents and sessions are separate entities. New metadata stores only secret
references; it does not import passwords, tokens or private chats. Existing upstream integrations
are retained, including their documented limitations in docs/PRIVACY.md; this milestone does not
claim to have audited or migrated every upstream credential store.

The browser preview uses the real React shell, tokens, CSS, pane registry and transitions. Its
isolated transport supplies clearly labelled deterministic demonstration data. It cannot spawn
PTYs, inspect local credentials or execute native commands. Desktop PTY code remains unchanged.

Closed ChatGPT/Work-like surfaces expose only connection metadata, Open Original and a canonical
reference here. Provider-native history/control needs a supported provider interface in a later
milestone. n8n routing is an event-contract simulation until explicitly configured and implemented.

Corresponding source accompanies the preview as `Alice-R213-source.zip` and is available in this
repository at the candidate commit recorded in the release manifest. Do not distribute the preview
without the license, notices and its corresponding source access.
