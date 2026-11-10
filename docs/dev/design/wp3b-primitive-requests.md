# WP3b: primitive follow-ups for the screen teams

Scope: `web/src/ui/**` plus the colour allowlist in `scripts/`. All changes are additive and backward-compatible; existing tests stay green. Spec: `docs/design/ui-fix-plan.md` 4.2, 4.3, 4.12, 4.13, 5.1. Tests: `*.requests.test.tsx`, `ui/requests.test.tsx`, `ui/TimerTile.test.tsx`, `ui/ViewfinderStrip.icons.test.tsx`, `ui/fields/Slider.valueText.test.tsx`, `scripts/test/check-ui_test.sh` (+ fixtures `colour-allow`).

| # | Decision |
|---|---|
| 1 | `ListRow` with `href`: inside a Router an `<a class="list-row__target">` built with `useHref` + `useLinkClickHandler` (accepted deviation from `Link`: `aria-current` stays explicit), outside a Router a plain `<a>`. The test asserts the router location changes (not `defaultPrevented`, which an anchor listener sees before React's delegated handler). |
| 2 | `aria-label?` overrides the target's name (default `title`); `data-*` props go to the `li` (typed `data-${string}`); `data-height`/`data-selected` stay ours. |
| 3 | `metaStatus?: ChipStatus` sets `data-status` on `.list-row__meta` (colour `var(--status-<s>-fg)`; `pinned`/`success` too) and shows the chip default icon (goesOff, leftover, ...) at 14 px; `metaIcon?: IconName` overrides it and works without a status. Icon is decorative. |
| 4 | Two trailing actions: pattern, no new prop. `trailing` may hold two `IconButton`s; `.list-row__trailing` becomes `display:flex; align-items:center; gap:var(--space-1)`; buttons already sit above the stretched target. `children` = extra content (Chips) in `.list-row__extra` (flex-wrap, gap 6) inside `.list-row__text`; such a row has `data-height="auto"` (min 64, grows). |
| 5 | `UnitSelect` takes `onCreate`/`createLabel`; default label `Use unit "<typed>"`. It is `searchable` whenever `onCreate` is given (otherwise nothing can be typed with <= 8 units). The default for plain `Select` stays `Create "<q>"`. |
| 6/16 | Icons `moveUp` (ArrowUp), `moveDown` (ArrowDown) and `mute` (SpeakerSlash). Bundle is 92 modules / 64,577 B of 65,536: **only ~950 B (one glyph) of headroom is left**; the PM should raise the budget before any further icon. Only one speaker glyph fits, so the ViewfinderStrip mute `IconButton` always shows `mute` and uses `pressed` (aria-pressed, fill weight) when muted; the name still switches Mute beep / Unmute beep. |
| 7 | `MemberSelect single`: props become `{single: true; value: number\|null; onChange(id)}`; without `single` unchanged. |
| 8 | `Select` gets `clearLabel` + `onClear` (so `onChange` keeps its `(v: V) => void` type and old call sites compile). The clear row is first in the list, selected while `value` is null, closes the list, is filtered by the search like any option, never counts as a duplicate for Create; the trigger shows `clearLabel` while nothing is chosen. `ShopSelect` with `clearLabel` has `onChange(id: number \| null)` and maps `onClear` to `onChange(null)`. |
| 9 | `BentoGrid columns={7}` (`repeat(7, minmax(0, 1fr))`). |
| 10 | On `.tile[data-variant='hero']`: `.chip[data-kind='why']` and `.button[data-variant='primary']` use `--color-surface` / `--color-accent-text`. |
| 11 | `mealSlotIcon`, `tagIcon` exported from `ui/index.ts`. |
| 12 | `Slider valueText?(v)`: `aria-valuetext` and a visible `.slider__caption` above the track; wins over a stop label. No caption without it. |
| 13 | `Avatar colour?: string` (any CSS colour value: the Member's stored hex, or `var(--...)`). Sets custom property `--avatar-colour` inline and `data-coloured="true"`; CSS draws `box-shadow: 0 0 0 2px var(--avatar-colour)`. A ring, not a fill, so initials keep their contrast on any Member colour; the value is data, not a literal in source, so the colour guard is unaffected. |
| 14 | `TimerTile` control names always carry the label: `Pause Rice`, `Resume Rice`, `Add a minute to Rice`, `Dismiss Rice`; new `onCancel` renders `Cancel Rice` (icon `close`), separate from `onDismiss` (clears a finished timer). Nothing in the repo asserted the old bare names. |
| 15 | `scripts/check-ui.allow-colours`: `<path substring>   # reason` per line, file-level, for rule `colour-literals` (CSS and tsx). An entry without a reason is ignored. Pre-registered: `web/src/features/signin/components/GoogleG.tsx` (the signin team must put the Google "G" SVG in exactly that file). Read from `$ALLOW_DIR` like the other allowlists. |
| 16 | `ViewfinderStrip` renders `IconButton`s (`torch`, `mute`), keeping names `Torch on/off`, `Mute beep`/`Unmute beep` and `aria-pressed`; no `.button`, no tonal/ghost. |

Red tests until implemented: ListRow 1-4 (not the no-Router case), UnitSelect create, clear row, hero chip/button rules, BentoGrid 7, Avatar colour, Slider caption, TimerTile, ViewfinderStrip, the colour-allow guard fixtures. Icons, the barrel exports, `MemberSelect single` and the prop types are already in place (stubs).

## Follow-ups from the screen reviewers

| # | Decision |
|---|---|
| 17 | `IngredientSelect` accepts a not-yet-saved choice: `IngredientChoice` has `id?: number` and `key?: string` (temporary key); the option value is `id ?? key`, so `value` is `number \| string \| null` and `onChange(id: number \| string)`. The Base Unit is shown **once**: as meta via `selectStrings.baseUnitMeta(unit)`; the unit badge (`leading`) is dropped. |
| 18 | `ViewfinderStrip` (ui-fix-plan 2.5, 5.6): `.viewfinder-strip__picture` is `height: 140px` (no `aspect-ratio`). Frame and reticle use new tokens in `styles.css` `:root`, defined once and never redefined for dark: `--viewfinder-frame: #10131a`, `--viewfinder-reticle: #ffffff`. The reticle border is `2px solid var(--viewfinder-reticle)`; `--color-on-accent` (near-black in dark mode) is no longer used. |

Red: `ui/Select/options.test.tsx` (two), `ui/Select/DomainSelects.test.tsx` (not-yet-saved choice), `ui/ViewfinderStrip.icons.test.tsx` (two).
