# QA-4: the action bar sits on the bottom nav (design note)

Step 1 (designer / test author), 1.0.0-beta.4.1. Branch `team/qa-sticky`, from main `7c38a53`.

## Defect
On phones (360, 390 px) the sticky Save / Start Cook Mode bar floats 16 px above the bottom bar, and page content shows through the strip. Users: Recipe editor, Recipe detail (`CookEntry`), Import `ConfirmTile` and `ExportPicker`, Recipe Assistant settings, Gallery.

## Root cause
`.sticky-action-bar { bottom: var(--nav-clearance) }`. `--nav-clearance` is a content clearance: `--nav-height + --nav-inset + --space-4 + safe-area`. It was meant for padding and for toasts, where a gap is wanted. The bottom bar's top edge is `--nav-height + --nav-inset + safe-area`, so the bar stops `--space-4` (16 px) short. Before PN the bottom bar was a different shape and the 16 px hid in its padding; PN's grid with inset and safe-area made it visible.

## Design
- New token in `shell.css`: `--nav-top: calc(var(--nav-height) + var(--nav-inset) + env(safe-area-inset-bottom, 0px))`, the height of the bottom bar's top edge above the viewport bottom. `0px` from 1024 (no bottom bar), like `--nav-clearance`.
- `.sticky-action-bar { bottom: var(--nav-top) }`: flush on the nav (Bento: the bar and the floating nav read as one stack; the bar is opaque and has its own top rule, so nothing shows through). No literal px, no `--space-*`.
- `--nav-clearance` is unchanged (content padding, toasts).
- Fix lives in the shared primitive only; no screen changes.

## Red tests
- `web/src/ui/StickyActionBar.test.tsx`: bottom is `var(--nav-top)`; offset has no literal / clearance / space token and `--nav-top` is built from height, inset and safe-area; no bottom margin.
- `web/src/app/shell.css.test.ts`: `--nav-top` definition and 0 from 1024; `.bottom-bar` uses the same tokens.
- `scripts/check-shell-layout.mjs` rule 13 (browser, not in check.sh): at 360 and 390, `/recipes/new`, gap between bar and nav is within 1 px, scrolled to top and end.
