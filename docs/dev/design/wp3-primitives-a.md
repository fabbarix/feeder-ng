# WP3: primitives A (actions, chips, tiles, layout)

Spec: [ui-fix-plan.md](../../design/ui-fix-plan.md) 4.2 to 4.4, 4.11 to 4.13, 4.15 and section 7 WP3. All work is in `web/src/ui/` (plus the guard
rules and one small `main.tsx` change). Tokens are WP1's, icons WP2's; nothing here adds a colour, size or icon literal.

## Scope and file layout
| File | State | Notes |
|---|---|---|
| `Button.tsx` + `Button.css` | change | variants `primary secondary accent-secondary tertiary danger danger-tertiary`, sizes `sm md lg xl`, `icon: IconName`, loading spinner (`[data-spinner]`) replaces the icon, single-primary dev warning |
| `IconButton.tsx` + `.css` | new | `icon`, required non-blank `label` (throws otherwise), `size` md/compact, `pressed` toggle (`aria-pressed`, `fill` weight) |
| `Chip.tsx` + `.css` | change | `kind` + `status` replace `tone` |
| `WhyChip.tsx` | change | `cause` picks the icon via `lib/whyIcon.ts` |
| `Tile.tsx` + `.css` | change | variants, `status`, `span`, `rowSpan`, `overline`, `media`, `stretched`; new `TileMetric` |
| `BentoGrid.tsx` + `.css` | change | CSS only (gap token, `align-items: stretch`, `grid-auto-rows: auto`) |
| `PageHeader.tsx` + `.css` | new | `<header>`, h1 `title`, `subtitle`, `leading`, `actions` |
| `ListRow.tsx` + `.css` | new | `ListGroup` (`ul` in a surface tile) and `ListRow` (`li`, stretched `<a>`/`<button>`) |
| `RecipeThumb.tsx` + `.css` | new | photo or generated tile (Tag icon via `lib/tagIcon`, initial via `lib/recipeInitial`) |
| `ProgressTile.tsx`, `TimerTile.tsx` + `.css` | change | built on Tile (`soft` / `status`); TimerTile states and controls |
| `EmptyState.tsx` + `.css` | change | `icon: IconName` in a 96 px soft circle, `headingLevel` |
| `Gallery.tsx` | new | dev catalogue, route `/_gallery` |
| `lib/legacy.ts`, `lib/whyIcon.ts`, `lib/recipeInitial.ts` | new | pure, unit-tested |
| `index.ts` | change | exports the above (Gallery is not exported; it is lazy-loaded in dev) |
| `test-utils.ts` | new | CSS reading helpers for the tests (excluded from the guards by name) |

Existing component CSS in `styles.css` moves into `ui/*.css`, imported by the component (`import './Tile.css'`). The Developer also moves the rules of
the primitives WP4 will rebuild (`BottomSheet`, `Stepper`, `Toast`, `Avatar`) as a mechanical move, unrestyled, so that `class-hooks` is green for
`web/src/ui`; and replaces the colour literals in `ViewfinderStrip.css` by tokens (`--color-surface-2`/`--color-text`/`--scrim`; a 2 px frame in
`--color-on-accent`). The `.tile` `min-height` rules in `styles.css` disappear; `features/board/board.css` (`.board-screen .tile`) is WP10's and stays a warning.

## Guards
`scripts/check-ui.rules` now sets `class-hooks`, `sizing` and `colour-literals` to `fail_paths=web/src/ui`. The commit with only tests and stubs
therefore fails `check-ui` until the Developer finishes; that is the red state.

## Decisions
- **Compatibility: keep a deprecated path, do not rewrite call sites.** 334 call sites use the old props; the screen teams (WP6 to WP11) own
  those files. Old props keep working and map onto the new ones in `lib/legacy.ts` (pure, tested); each carries `@deprecated` in its type and is removed
  once WP11 merges. Mapping:
  - `Button variant="tonal"` -> `secondary`, `"ghost"` -> `tertiary` (rendered `data-variant` is always the new name).
  - `Chip tone`: neutral -> `tag`, accent -> `why`, spoil/leftover -> `status` + that status; a clickable chip with no `kind` is a `filter`. `icon` still accepts a ReactNode.
  - `Tile tone`: neutral -> `surface`, accent -> `soft`, spoil/leftover -> `status`; `size` wide/full -> `span="full"`, others -> 1 (sizes no longer set heights).
  - `Tile onClick` -> the tile gets `role="button"`, `tabIndex=0`, Enter/Space handlers. It is still never a `<button>` element (inner buttons stay valid HTML).
  - `EmptyState illustration` is rendered when no `icon` is given.
  - `TimerTile onClick` follows the Tile path. The timer `data-state` values change: `expired` is replaced by `finished` (exactly 0) and `overdue` (below 0, shown `+m:ss`);
    no other code reads `expired`.
- **Stretched pattern.** `stretched={{ label, href } | { label, onActivate }}` renders an `<article>` with a last-child `<a class="tile__stretch">` or
  `<button class="tile__stretch">`, absolutely positioned over the tile (`z-index: 0`); inner buttons/links get `position: relative; z-index: 1`. `ListRow` uses the same
  pattern (`list-row__target`), so a trailing IconButton never nests inside another interactive element.
- **Single-primary warning.** `Tile`, `ListGroup` and (in WP4) BottomSheet/Dialog carry `data-primary-scope`. A primary `Button` checks in an effect, in dev only
  (`import.meta.env.DEV`), that its closest scope (or the document) holds one `[data-variant=primary]`; otherwise it `console.warn`s
  "more than one primary Button in the same scope" once per scope. Secondary/tertiary (and deprecated tonal/ghost) do not count.
- **Chip tokens live in CSS only** (`Chip.css`, selectors `.chip[data-kind=...]` and `.chip[data-kind=state|status][data-status=...]`); the tests read the stylesheet
  and assert the token pairs of plan 4.3. A `state`/`status` chip without `status` falls back to `tag` and warns in dev.
- **Gallery.** `main.tsx` adds, only `if (import.meta.env.DEV)`, a lazy top-level route `/_gallery`. It renders two sections `[data-scheme="light"]` and
  `[data-scheme="dark"]`; every Button/IconButton/Chip/Tile/ListRow/Thumb/Timer/EmptyState variant x state sits in a `data-primary-scope` cell. For the dark section to
  be themed beside the light one, the Developer widens the dark token selectors in `styles.css` from `:root[data-scheme='dark']` to also match
  `[data-scheme='dark']` (and the light defaults to `:root, [data-scheme='light']`); that is the only change to the token block and is listed in the report.
- **Icons** only via `ui/Icon`; the `Check` of a filter chip, the Tag icon, chevrons, spinner glyph (a CSS ring, not an icon) all follow. Icon sizes: 14 chips, 16 sm buttons, 20 md, 22 lg, 24 list-row lead.
- **Type** uses `--text-*` tokens (chip `--text-chip-size`, label, overline, display for TileMetric and the timer); no px font sizes.
- Hit areas of 44 px on `sm` buttons, compact IconButtons and filter chips use a `::after` pseudo-element, not size.

## Review follow-ups (tests first, then code)
- **ListRow target.** The whole row is the tap target: in `ListRow.css` every child except the target is `pointer-events: none; position: relative; z-index: 1` (`.list-row > :not(.list-row__target)`): the lift is mandatory, because the absolute target has opaque hover, press and selected backgrounds that would otherwise paint over lead, title and chevron, and `pointer-events: none` keeps the lift from catching clicks;
  only interactive elements inside `.list-row__trailing` (`button`, `a`, `input`, `select`, `textarea`, `label`, `[role=button]`, `[role=checkbox]`, `[role=switch]`) get `pointer-events: auto; position: relative; z-index: 1`. A click on title, lead or chevron
  therefore reaches the target (jsdom cannot hit-test: CSS contract test plus a click test on the target).
- **Tile inside a tile.** The Tile.css rule lifting inner `button`/`a` is `.tile :is(button, a):not(.tile__stretch):not(.list-row__target)`, so a ListRow keeps its absolute target (any selector targeting `button`/`a` is fine; no `button:not(a)` workaround needed).
- **Danger button.** Text is `--status-danger-on-solid`, white in light and both dark blocks of `styles.css` (AA on the dark solid too), replacing `--color-surface`.
- **Palette.** `styles.css` holds one light block, `:root, [data-scheme='light']`; the non-colour `:root` tokens stay in a separate `:root` block.
- **ListGroup** carries `data-primary-scope` on `.list-group`.
- **Nits.** `Button.css` `font-weight` is a token (lg uses `--text-title-3-weight`); `.tile__overline` gap is a token; `.tile[role='button']` has `cursor: pointer`.
- **TimerTile with `onClick`** (deprecated): the focusable element is `role="button"` named by the label, keeping `data-state` and the time text; `role="timer"` is dropped there
  (a focusable operable element must expose its action; a timer role on it would hide it). Without `onClick` the tile stays `role="timer"`.
- **Accepted deviation.** The ListRow divider is full width (a 1 px `--color-line` between rows), not inset as plan 4.13 sketches; accepted by the reviewer.

## Public signatures the tests rely on
See the stubs: `ButtonProps`, `PRIMARY_SCOPE_ATTR` (`'data-primary-scope'`), `IconButtonProps`, `ChipProps`/`ChipKind`/`ChipStatus`, `WhyChipProps`/`WhyCause`,
`TileProps`/`TileVariant`/`TileSpan`/`TileStretched`/`TileMetric`, `PageHeaderProps`, `ListRowProps`/`ListGroupProps`, `RecipeThumbProps`, `TimerTileProps`/`TimerState`,
`EmptyStateProps`, `resolveButtonVariant`, `resolveChip`, `resolveTile`, `whyIcon`, `recipeInitial`. DOM contract (class and data attributes the tests query):
`.chip[data-kind][data-status]`, `.chip__icon`-less Icon svg, `.tile[data-variant][data-status][data-span][data-row-span]`, `.tile__media`, `.tile__stretch`,
`.list-row[data-height][data-selected]`, `.list-row__lead`, `.list-row__chevron`, `.list-row__target`, `.recipe-thumb[data-size]` / `[data-generated][data-tag-icon]`,
`.empty-state__art`, `.timer-tile__bar`, `[role=timer][data-state]`, `button[data-spinner]`.

## Tests (red until implemented)
`Button`, `IconButton`, `Chip` (+ WhyChip, EmptyState, Avatar), `Tile` (+ BentoGrid, ProgressTile, TimerTile), `ListRow`, `RecipeThumb`, `PageHeader`, `Gallery`, `ui-css`,
`lib/legacy`, `lib/whyIcon`, `lib/recipeInitial`. Also `Icon.test` gains the empty-label case (WP2 nit, already implemented).

## Leftovers from WP2 applied here
`Icon label=""` is decorative; `ui-fix-plan.md` section 7 WP2 acceptance reworded (bundle size wording).
