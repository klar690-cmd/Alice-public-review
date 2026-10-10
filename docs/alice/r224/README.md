# Alice R224 — optional Cream & Rose skin

This preset adds warm cream canvas, ivory windows, white cards, dark ink, taupe secondary text and dusty rose accents to the existing Alice/Alethe frontend. Choose **Menu → Choose theme → Cream & Rose**, or use **Preferences → Appearance**. The original Alethe default remains first in the selector and can be restored instantly; all other existing presets remain available.

## Scope and provenance

Exact R222 functional parent: `0a638f0f9b14620d86d818595a9363ab2e689d8e`. Execution branch: `alice/r224-optional-ivory-rose-theme-v1`. R222 documentation HEAD `b7a62cbfc52db46ea36aab56d3744477fac8b9cb` is not merged.

The preserved unfinished theme branch `codex/alice-cream-rose-theme` in `C:/Projetos/Alice` was inspected read-only. Its 17 changed/untracked files were inventoried with byte counts and SHA256 before implementation. Only the reviewed palette and relevant scoped style/menu fragments were ported intentionally into the exact-based worktree. No bulk merge, cherry-pick, reset, stash, overwrite or removal of that work occurred. Its proposed radius, font-size, font-family, animation-duration, easing and ASCII motion-strength changes were excluded to preserve R222 geometry and Alethe motion. Final evidence verifies all 17 original file hashes remain unchanged.

The user's supplied screenshot was inspected locally. Colors below are deliberately documented approximations inspired by that reference, not claims of exact image sampling. No reference-site branding/content or new assets/fonts are copied. Existing AGPL attribution and font/art licenses remain intact.

## Semantic palette

| Role | Token / color |
| --- | --- |
| Canvas | `--bg` / `#efe7d6` |
| Ivory window and input | `--bg-sunken` / `#f8f3ea` |
| Elevated ivory | `--bg-elevated` / `#fffdf8` |
| White card | `--panel` / `#ffffff` |
| Ink | `--fg` / `#24211e` |
| Secondary and small text | `--fg-muted`, `--fg-faint` / `#655e55` |
| Rose text, focus, selection | `--accent`, `--focus-ring` / `#914667` |
| Pale rose selection | `--accent-soft` / `#f5e6ec` |
| Taupe border | `--border` / `#d8ceba` |
| Dark primary action / selected pill | `--action-bg` / `#24211e` |

The existing theme-pack contribution system provides whole-app tokens and a coordinated light xterm ANSI palette. Standard shell, sidebar, project/account/agent cards, pane headers/rails, inputs, menus, overlays, dialogs, badges, splits and scrollbars consume those tokens. Component additions are scoped to `[data-theme='cream-rose']`; they add no literal colors. Home ASCII colors and opacity adapt while its image, dimensions, flow, pointer response and motion controls remain original. The fairy artwork retains its approved black-background art. Existing fonts, layout, spacing, sizes, icons, transitions and reduced-motion mechanisms are inherited.

Core text/status colors are tested at >=4.5:1 against major surfaces. Focus contrast is >=3:1. All 16 ANSI colors and cursor/foreground are tested against the coordinated ivory terminal background. This is a targeted contrast check, not an independent certification of every upstream screen or arbitrary ANSI sequence/background.

## Persistence and boundaries

The preset uses existing `preferences.uiTheme` and per-profile `projects.json` persistence. No schema/version or separate storage is added. Malformed theme values normalize to the existing default. Safe unavailable plugin IDs remain stored so temporary plugin disablement does not erase preferences; the main shell renders the original default until they resolve. Explicit terminal-theme overrides remain independent; null continues to follow the UI.

R222 first name → Home, future launch → Home, safe X/+, pane reopening, native handles, aliases, accounts, IDs, links and canonical read-only guards are preserved. The portable preview retains the R222 historical synthetic canonical fixture: it is explicitly test-only and cannot authorize live dispatch. This theme task does not change canonical contract parsing, authentication or providers.

Native Windows app/PTY/installer, detached OS windows, real authentication and live n8n/runner are **NOT_RUN** and separate gates. No new toolchain is installed, no personal browser context is used and no agent process is started. The preview uses the real frontend and synthetic isolated metadata; linked/native-only capability labels remain truthful.

## Delivery

Release: https://github.com/klar690-cmd/Alice/releases/tag/alice-preview-r224

The release includes the portable HTML, exact functional source ZIP, evidence ZIP, SHA256SUMS and LICENSE/NOTICE/UPSTREAM. Producer validation does not replace GG/user visual review or independent QA. R224 ends after publication and parking.
