# UF1 Slim the Phosphor bundle, add ImagePicker glyphs

Rule: CLAUDE.md "Icons come only from Phosphor Icons, through our shared icon component". Registry: [wp2-icons.md](wp2-icons.md).

## Problem
The icon bundle was 65,505 B gz of a 65,536 B budget (93 modules), so no glyph could be added. The ImagePicker
(team/ip1-imagepicker) needs `camera`, `clipboard`, `link`, `rotateRight` and `rotateLeft`. Each
`@phosphor-icons/react/dist/csr/<Name>` module imports `dist/defs/<Name>` which is a `Map` of **six** weights
(`bold, duotone, fill, light, regular, thin`); `IconBase` picks one at render time.

## Weights the code uses
`Icon` accepts `regular|bold|fill|duotone`. Callers (grep `weight=`): `fill` (AppShell active, LineTile/SelectPanel tick, pressed IconButton),
`duotone` (EmptyState at 64 px for **any** `IconName` passed by screens, CelebrationTile), `bold` (default <= 16 px), `regular` (default).
`thin` and `light` are never reachable (not in the `IconWeight` type). Duotone cannot be limited to a fixed glyph list
without a type-level restriction, because `EmptyState` takes any `IconName` and a missing weight renders an **empty svg**.

## Options evaluated (installed: `@phosphor-icons/react` 2.1.10 only)
Measured with the real build (lib mode, react external, minified, `gzip -9`) in a scratch copy outside the repo, 93 glyphs unless noted.

| Option | Verdict | gz |
|---|---|---|
| Baseline, today | | 65,649 B in scratch (65,505 B with the repo script) |
| (a) per-weight subpath imports | Not available: `dist/csr/<Name>.es.js` and `dist/defs/<Name>.es.js` hold all six weights, `exports` has no per-weight entry. Rejected. | n/a |
| (c) generated module from `@phosphor-icons/core` SVGs | `@phosphor-icons/core` is **not installed**, and no downloads are allowed. It would also move glyph rendering out of the Phosphor React component. Rejected (revisit only if sizes force it). | n/a |
| (b1) Vite plugin: drop `thin` and `light` (keep 4) | **Chosen.** Safe for every `IconName` at every weight the type allows. | 39,676 B |
| (b2) plugin: keep regular/bold/fill only | Breaks EmptyState and CelebrationTile (duotone). Rejected. | 34,918 B |
| (b3) plugin: 3 weights + duotone for an allowlist of EmptyState glyphs | Saves only 0.5 kB over (b1)'s duotone and needs a hand-kept list that fails silently (empty svg) for a new EmptyState icon. Rejected. | 35,440 B |
| (b1) with the 5 new glyphs (97 glyphs; `rotateLeft` reuses a glyph) | Expected final state | **40,952 B** |
| No plugin, 97 glyphs | What the old mechanism would cost | 68,255 B |

Chosen: **(b1)**, a build-time transform. It keeps the CLAUDE.md rule (Phosphor only, per-icon `csr` imports, through `ui/icons.ts` and `<Icon>`): no screen changes and `icons.ts` keeps one import per glyph.
Expected: 65,505 B -> 40,952 B (-37%) including the four new glyphs; ~427 B per glyph, so the 43,008 B budget leaves ~2.0 kB (about four more glyphs).

## Design
- `web/vite.phosphor-weights.ts` exports `phosphorWeights(options?)`: a Vite plugin (`enforce: 'pre'`, `name: 'feeder:phosphor-weights'`).
  `transform(code, id)` acts only on ids matching `@phosphor-icons/react/dist/defs/<Name>.es.js`; it parses with `this.parse`, finds the array of `[weightName, element]` pairs
  that feeds `new Map(...)`, keeps entries whose weight is in `KEPT_WEIGHTS = ['regular','bold','fill','duotone']` and re-emits the array. If the layout is not found it **throws** (a Phosphor upgrade must not silently ship all weights or none).
  Prototype (works as-is on 2.1.10): collect the outer array whose elements are all 2-element arrays with a string-literal first element, then `code.slice(0, outer.start) + '[' + kept.join(',') + ']' + code.slice(outer.end)`.
- `web/vite.config.ts`: add `phosphorWeights()` to `plugins` and `test.server.deps.inline: [/@phosphor-icons/]`, so vitest runs the same transformed modules as production (node_modules are otherwise externalised and untransformed).
- `web/tsconfig.json` `include`: add `vite.phosphor-weights.ts`.
- `web/src/ui/icons.ts`: add the five keys and four imports (`Camera`, `ClipboardText`, `LinkSimple`, `ArrowClockwise`; `rotateLeft: ArrowCounterClockwiseIcon`). Update the header comment. `Icon.tsx` unchanged.
- `scripts/check-ui.sh` rule `phosphor` (mode `fail` in `check-ui.rules`, covered by `scripts/test/check-ui_test.sh`) already forbids `@phosphor-icons/react` outside `web/src/ui/icons.ts` and any barrel import. No new guard needed; the plugin file lives outside `web/src` and only mentions the package path as a string.
- Scope of the stripping: it applies to `vite build` and to vitest (via `server.deps.inline`). The dev server pre-bundles dependencies and serves all weights, so thin and light still render there.
- Update `scripts/test/icons-bundle_test.sh` header numbers only if the measured size moves.

## Tests (red now)
- `scripts/test/icons-bundle_test.sh`: needs `web/vite.phosphor-weights.ts`; budget **43,008 B** (expected 40,952 B + ~2.0 kB headroom); `MIN_MODULES=97`; the chunk must contain no `"thin"`/`"light"` and must contain `regular`, `bold`, `fill`, `duotone`.
- `web/src/ui/icons.test.tsx`: rows `camera`/`Camera`, `clipboard`/`ClipboardText`, `link`/`LinkSimple`, `rotateRight`/`ArrowClockwise`, `rotateLeft`/`ArrowCounterClockwise` (same svg as `undo`).
- `web/src/ui/icons.weights.test.tsx`: every registry icon draws at regular, bold, fill, duotone (green now, the guard against empty glyphs after stripping); `thin` and `light` render nothing (red until the plugin and `server.deps.inline` land).
