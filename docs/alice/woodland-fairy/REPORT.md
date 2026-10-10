# Historical user-approved visual checkpoint (before R216 publication)

This record describes the local checkpoint before R216. The authoritative current delivery is docs/alice/r216/REPORT.md.

# Alice — current profile and ASCII background

RESUMO_PARA_GG: The current user-selected result is the woodland fairy on a black profile background, and the original Alice A monogram rendered by the original animated ASCII effect on Home and loading. Preferred-name entry and persistence remain available. Changes are local and uncommitted; no game changes or new GitHub publication.

## Current implementation

- The profile uses the revised black-background fairy PNG, generated from the approved fairy design at the user's request.
- Home and loading import the existing src/assets/alice-mark.svg. This reuses the original Alice A, rather than generating a new mark.
- Original ASCII renderer, flow, character size, brightness, contrast, threshold, pointer response, fit mode and Home backdrop CSS are restored. No solid-image underlay or added image-motion layer remains.
- The user-chosen name is saved through the existing preferences and displayed in full with its chosen capitalization. Skip and close discard unfinished name edits.
- The unused fairy background illustration is retained as a source-art variant only; it is not the current runtime backdrop.

## Identity and authorization

ASSISTENTE/WORK. RumoAoMilhao remote coordination fetched fresh: R214, PARKED / CURRENT_TASK NONE on assistente/source-art-active. This is a direct user-requested Alice visual update, including the final instruction to restore the A and its first-version ASCII effect.

Alice branch: alice/r213-alethe-fork-v1. Base HEAD: 5f9f8ff71576d90bbe7da6d0e25e33880480768f. No commit, push, tag or release was performed. No game, persistence schema, trade/economy or gameplay changes.

## Validation

Final preview tsc + Vite build + single-file HTML inlining PASS. Four relevant Vitest files / 29 tests passed during this update. git diff --check PASS. Original AsciiEffect and Home CSS have no changes versus the base HEAD. Targeted ESLint earlier in this update: zero errors and two import-sort warnings in App/Home imports.

Compiled HTML opened in the browser. Welcome shows the black fairy avatar and stored preferred name. Home visibly shows the A made of ASCII characters. Console inspection returned no errors or warnings. home-A-ascii.jpg and welcome-black.jpg are the current visual evidence. No native installer build was requested.

## Delivery

HTML: C:/Projetos/RumoAoMilhao-ASSISTENTE/.local/alice-art-approval-v1/integrated/Alice-A-ascii.html
Local URL: http://127.0.0.1:1424/integrated/Alice-A-ascii.html
Bytes: 31130448
SHA256: 3117d2c26e7ef2f5f43f4535144c08dfb664407c9d634e069772a5d84d6d2c65

Profile PNG SHA256: 150a076638068e44905ec45b91958b57b20b25661b4bf22bb19b58aab23f695c
Existing A SVG SHA256: 34441ba2fa79b78f44eacaae88995f80259b671197bd6bfa857c34344d57f999

The Alice-fada-fundo-preto.html local URL is also updated to this same final artifact. The earlier GitHub R213 release remains untouched. The preview's previously disclosed simulated-provider and desktop-only PTY boundaries are unchanged.
