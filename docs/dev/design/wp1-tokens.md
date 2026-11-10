# WP1 Tokens and theme (UI fix plan round 2)

Spec: [ui-fix-plan.md](../../design/ui-fix-plan.md) 3.1 to 3.3 and 7 (WP1). Scope: `web/src/theme/*`, the `:root` token block of
`web/src/styles.css`, and the font import in `web/src/main.tsx` (one line). No other production file changes.

## Public API the tests rely on
- `color.ts`: `Oklch {l,c,h}`, `hexToOklch(hex)`, `oklchToHex({l,c,h})`. Standard Ottosson OKLab matrices. `oklchToHex` maps out-of-gamut
  colours by binary-searching chroma down (lightness and hue kept), then rounds to 8 bits; hue wraps. Achromatic input returns `h = 0`.
  Existing hex/HSL helpers stay (contrast.ts still uses HSL for its `ensureContrast` safety net).
- `palette.ts`:
  - `COLOR_TOKENS` (13 keys, camelCase: `bg surface surface2 surface3 line outline text muted accent onAccent accentText soft softStrong`),
    `ColorToken`, `Palette {scheme, colors, status}`, `STATUS_NAMES`, `StatusName`, `StatusColors {fg,bg,solid}`,
    `STATUS_PALETTE[name][scheme]` (replaces `STATUS_COLORS`; fixed data, already filled in), `COLOR_ALIASES`.
  - `generatePalette(input, scheme)`; `ThemeInput.secondary` is kept but ignored.
  - `cssVarName(token)`: `surface2 -> --color-surface-2`, `onAccent -> --color-on-accent`. `statusVarName(name, part)`: `--status-spoil-fg`.
  - `toCssVars(palette)`: new `--color-*`, then every alias in `COLOR_ALIASES` as `--color-<old>` with the aliased value, then 15 `--status-*`.
- `apply.ts`: unchanged logic (writes `toCssVars` + `color-scheme` + `data-scheme`); it gets alias and status variables for free.

## Generation rule (Developer)
Take `hexToOklch(accent)` -> hue `h`, `C = clamp(c, 0.04, 0.16)`. Each token is `oklchToHex({l, c, h})` with `(l, c)` from the 3.1 table; `C` marks the
accent-chroma tokens (`accent`, `accentText`). Light `onAccent` is `#ffffff`. Wrap each text/boundary token in `ensureContrast` (min 4.5, or 3 for
`outline`/`accent` boundaries) as a safety net; for the 7 presets it must be a no-op. I verified with an independent implementation that this exact rule
reproduces the plan's Basil table hex-for-hex and passes every pair of the contrast contract for all 7 presets x 2 schemes
(`palette.golden.ts` holds that output).

Aliases (old -> new): `background->bg`, `on-background->text`, `surface-container-low->surface`, `surface-container->surface2`,
`surface-container-high->surface3`, `on-surface->text`, `on-surface-variant->muted`, `primary->accent`, `on-primary->onAccent`,
`primary-container->soft`, `on-primary-container->accentText`, `secondary->accent`, `on-secondary->onAccent`,
`secondary-container->soft`, `on-secondary-container->accentText`. `--color-surface` and `--color-outline` keep their names (new values).
Remove aliases in the release after WP6 to WP11 land.

## CSS tokens (`styles.css`, first `:root` block)
Names the tests pin (values from plan 3.2 and 3.3):
- Type: `--text-<name>-size|line|weight` for `display title-1 title-2 title-3 body-strong body meta label overline`; `--text-overline-tracking: 0.04em`;
  `--text-chip-size: 12px`; `--text-nav-size: 11px`, `--text-nav-weight: 800`.
- Spacing: `--space-1,2,3,4,5,6,8,10,14`; rhythm `--gutter`, `--bento-gap`, `--tile-pad` (16/10/16 phone). Tablet override (`min-width: 768px`)
  24/12/20; desktop (`min-width: 1200px`) 32/16/26, as `@media ... { :root { ... } }` blocks.
- Radii: `--radius-chip control button button-lg tile-sm tile hero board sheet dialog thumb thumb-lg nav`; `--radius-pill` kept.
- Elevation: `--elev-0..3`, `--scrim`; a `:root[data-scheme='dark']` rule sets `--elev-1..3: none` (dark uses tone step + `--color-line` hairline).
- Motion: `--dur-1..3`, `--ease-out`, `--ease-spring`; `--motion-fast` kept. `@media (prefers-reduced-motion: reduce) { :root { --dur-n <= 120ms } }`.
- Colour defaults: Basil light values for the 13 `--color-*` tokens and 15 `--status-*` (so first paint is right before `ThemeProvider` runs), old
  names kept defined. Remove the old `@media (prefers-color-scheme: dark)` colour block's stale values or re-point them to the Basil dark values;
  delete the hard-coded `#ffdad1` / `#fff0b3` (status tiles must read `--status-spoil-*` / `--status-leftover-*`; the selectors that use them are
  in `styles.css`, outside the `:root` block, so the Developer only swaps the two literals for `var(--status-...)`, the minimal shared-file touch).
- Font: `main.tsx` adds `import '@fontsource/figtree/800.css'` (package already installed).

## Decisions
- Status tokens live on `Palette.status` (per scheme) instead of a second function, so `apply.ts` stays a single call.
- Test fixture reads sources through an untyped `node:fs` dynamic import (no `@types/node` in the repo; vitest blanks CSS imports).
- The contrast contract (`contrast.test.ts`) is untouched; it opens itself because the stub already exposes the Bento keys, and is red until implemented.
- Old `palette.test.ts` assertions on Material tokens were replaced by table-driven ones; no pair was weakened (13 pairs now, vs 11).

## Out of scope
Screens, primitives, icon wrapper (WP2), board scale factor (x1.75, WP10).
