# Owner-requested tree / girl / cat artwork

Direct owner request on 2026-10-09, explicitly after completing the sidebar/port-drag task: use the supplied “Menina e Gato sob a Lua Cheia (1).png” for Alice's profile and ASCII background. Latest clarification: **the profile must be exactly the supplied image**. Its original bytes, including the moon, are therefore copied unchanged for the profile. Only the separate ASCII input removes the moon and retains tree, girl, cat and leaves.

For the ASCII-only version, the built-in image editing tool removed moon/crater textures, pocket watch/chain and glowing keyhole. A second edit filled retained subjects in pale ivory/silver for luminance-based ASCII legibility. This edited illustration is **not the profile photo**. No CLI/API key, third-party service or dependency installation was used. The original supplied file and generated originals remain untouched.

Profile asset: `src/assets/alice/original-girl-cat-moon-profile.png`, exact original byte copy verified by SHA-256. ASCII asset: `src/assets/alice/tree-girl-cat-black.png`, generated PNG bytes without raster postprocessing. Earlier fairy and A assets remain preserved. Custom user profile-photo overrides remain respected by the unchanged fallback logic.

The existing ASCII renderer, flow/mouse animation, timing/reduced-motion behavior, fonts, greeting and theme palette code are unchanged. Its image input changes and the scene is aligned to the right beside the composer, following the owner's additional ASCII screenshot reference. The prior sidebar integration and manual graph wiring remain included. No real agent/n8n execution, game or native/default-branch change.

## Prompt set — built-in image editing

1. Precisely remove the large moon and crater textures, watch/chain and glowing keyhole; keep only the original tree, girl sitting on the branch, cat and leaves. Preserve silhouette poses, proportions, composition, bow, flowing hair, dress, stockings and dangling legs. Pure black background; restrained ivory/silver foreground for profile and ASCII readability. No new scene, objects, characters, text, circle or halo.
2. Keep the prepared composition, poses and contours unchanged. Fill the retained foreground girl/cat/tree/leaves as broadly pale ivory/silver silhouettes, with limited dark hair/tree/stocking detail. Keep pure black negative space; no moon, clock, chain, keyhole, stars or extra objects. Improve 48px avatar and ASCII legibility.

## Unreleased

- Applied the exact unedited owner-provided image as the standard profile; applied its separate moon-free tree/girl/cat/leaves version to the existing animated ASCII background.
- Preserved custom profile choices, older assets, theme/layout behavior and the completed sidebar/drag implementation.

See PREVIEWS.md, RESULT.md and HASHES.json for actual screenshots, exact source provenance, asset/HTML hashes and validation. Visual review remains with the owner.
