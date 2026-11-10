# U1: TimeField on iPad, and one inner padding for all fields

Bug: Settings > Meal Slots > "Add Meal Slot" on iPad Safari. "19" shows as "1", "30" as "3(", the Hour focus ring is a small circle cutting the digits,
the segments sit cramped at the left, and the Name text is indented more than the Weekdays value.

## Root cause (from the CSS)
`web/src/ui/fields/TimeField.css`, `.time-field__segment`:
- `inline-size: 2.2ch` with the global `* { box-sizing: border-box }` (styles.css) and `padding: var(--space-1)` (4 px each side): the content box is
  2.2ch - 8 px (about 15 px at 18 px Figtree) for two 800-weight digits that need about 22 px. `ch` is the width of "0" in the regular face, not 800.
  The input scrolls internally, so the tail is clipped.
- WebKit keeps native input chrome (`appearance`, intrinsic 1px 2px padding) because neither is reset.
- `border-radius: var(--radius-chip)` (999px) on a narrow box turns the 3 px focus outline into a circle.
- `.time-field` is `inline-flex; align-self: start`, so it hugs the segments instead of filling the field row like TextField/Select.
Padding: `.ui-field__input` (Field.css) has no `padding`, so WebKit adds its intrinsic 2 px on top of the control's `--space-3`; `.select__trigger`
has none, hence the Name text sits further right than the Select value. Three primitives repeat the literal `0 var(--space-3)`.

## Fix (shared primitives only; DateField and NumberField do not use segments, they need only the token)
1. Field.css: `:root { --field-pad-inline: var(--space-3); }`. `.ui-field__control`, `.select__trigger` (Select.css) and `.time-field` use
   `padding: 0 var(--field-pad-inline)`. `.ui-field__input` gets `padding: 0; -webkit-appearance: none; appearance: none`. `.select__value` has no padding.
2. `.time-field__segment`: `-webkit-appearance: none; appearance: none; padding: 0; min-inline-size: 3ch; inline-size: 3ch` (generous for two 800 digits,
   with nothing eating it), `font-variant-numeric: tabular-nums`, `text-align: center`, `border-radius: var(--radius-control)` smaller than a pill
   (a 8-10 px rounded rect), focus-visible: same radius, `outline-offset: 0` or inside the box so the ring never crosses the digits.
   Prefer `inline-size: calc(2ch + 1ch)` only if a sizer proves necessary; no `ch` value below 3.
3. `.time-field`: `display: flex; align-self: stretch; inline-size: 100%` like `.ui-field__control`, segments left aligned with the shared padding,
   `gap: var(--space-1)`, colon centred. Disabled style unchanged.
4. Every TimeField use gets the fix for free: MealSlotEditor (Usual time), HouseholdSettingsForm, GalleryOverlays. No per-screen CSS.
Do not touch Select.tsx/lib.ts/options.tsx, ui/index.ts, strings.ts, BackLink.*, ColorSwatches.* (team R11a).

## Tests (red first)
`web/src/ui/fields/field-css.test.ts`: segment appearance/padding/tabular-nums/min-inline-size/no small ch width/non-circular focus radius; token
defined; TextField control, Select trigger and TimeField use `--field-pad-inline`; input padding reset and Select value without padding.
`TimeField.test.tsx`: both segments are inputs with the shared `time-field__segment` class inside `.time-field` (regression guard, already green).

## Verification plan
- scripts/check.sh (build/check.log) green. jsdom has no layout, so also in a real engine:
- Local WebKit: `~/.cache/ms-playwright/webkit-2336` (Playwright WebKit, with `pw_run.sh`) and chromium-1234, firefox-1538/1572 are installed.
  Playwright is NOT a web/ dependency; `playwright` and `playwright-core` exist only in the npx cache (`~/.npm/_npx/*`). Developer may run a throwaway
  script from the scratchpad against `pnpm -C web dev` (no download): iPad viewport 820x1180, open Settings > Meal Slots > Add Meal Slot, assert for both
  segments `scrollWidth <= clientWidth`, the Name input, Select value and Hour text share the same left x (within 1 px), the focus outline box
  contains the digits, and take a screenshot. Repeat in Chromium. Not added to check.sh.
- Layout-check tooling: `scripts/check-shell-layout.mjs` is Chrome-only and covers shell routes, not forms; leave it unchanged, no new entry.
