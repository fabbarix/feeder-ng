# QA-1: Today hero action and Board clock (1.0.0-beta.4.1)

Two visual defects from the beta.4 QA pass. Both are CSS/markup only; no domain, API or string changes.

## 1. Today hero: "Choose a Recipe" is nearly invisible

**Cause.** `CourseRow` renders the empty Course's action as `<Button variant="tertiary" size="sm">`. Tertiary is transparent with
`color: var(--color-accent-text)`, designed for surface backgrounds. The Today hero (`Tile variant="hero"`) paints
`--color-accent`, so the label is accent-text on accent: rgb(162,227,185) on the dark green, 1.5:1 in light; 1.3:1 in dark
(accent-text and accent are both light greens there). `Button.css` already restyles `primary` and `secondary` for the hero
(`.tile[data-variant='hero'] .button[...]`) but not `tertiary`.

**Design.** It stays a real `Button` (same component, same `onChoose`, same label).
- `CourseRow` gets an `onAccent?: boolean` prop. When set, the empty-Course action uses `variant="secondary"`; otherwise it stays `tertiary`
  (week grid and Plan cards sit on surfaces and are fine).
- `TonightHero` passes `onAccent` to its compact rows.
- `secondary` inside the hero is already `background: var(--color-surface); color: var(--color-text)`: the same
  "surface button" language as the hero's Cook button, with text on surface at AA in every accent and scheme (cf. `cookedContrast.test.ts`).
- Emphasis: Cook remains the one primary (surface + accent-text, large); Choose a Recipe is a small surface button. No new variant needed.

The developer may instead add a hero rule for `tertiary` (e.g. `on-accent` text) if the Reviewer prefers, but the test requires
that whichever variant is rendered has a hero rule and meets 4.5:1 on its own background, computed from tokens.

## 2. Kitchen board at 768-1024 px: clock tile clipped

**Cause.** `.board-cell` is the size container (`container-type: inline-size`); the tile has 20 px side padding and
`overflow: hidden`. From 600 px, `.board-clock__time` is `32cqi` and `.board-clock__date` a fixed `2rem` with
`overflow-wrap: anywhere`. `cqi` is a share of the whole cell, ignoring the 40 px padding, so the time ("13:06", about
2.8 em of tabular digits) is wider than the content box once the cell is narrow: at 820 px the cell is about 181 px, the time
is 58 px (about 163 px wide) in a 141 px box, so it touches the edge and is clipped. "November" at 32 px (about 140 px wide) with `anywhere` breaks as
"Novembe" / "r".

**Design.** Size from the content box, never break words.
- Time: `font-size: calc((100cqi - 40px) / 3)`, no more than the current `32cqi` (`min(32cqi, ...)` is fine). The 3 is the width of "00:00" in em.
- Date: `font-size: min(2rem, calc((100cqi - 40px) / 5))`; 5 is "November" (the longest month is "September", 9 letters; use
  `/ 5.5` if the developer measures it wider) in em. `overflow-wrap: normal`, so a long word is scaled, never split; spaces still wrap the date onto lines.
- The base (phone) block keeps its `22cqi` / `12cqi` values. `min-width: 0` on both so a long line cannot grow the cell.
- At 768 (cell 168 px): time 42 px, date 25 px. At 1024 (cell about 230 px): time 63 px, date 2rem cap reached at 240 px cells and above.

## Guard
`scripts/lib/page-layout-rules.mjs` learns two rules, and `scripts/check-page-layout.mjs` probes them:
- **P10**: a Button label under 4.5:1 against its effective background (`lowContrastButtons: [{label, ratio}]`).
- **P11**: text clipped by its box (`scrollWidth > clientWidth` with `overflow: hidden`) or a word split across lines
  (`brokenText: [{sel, why}]`; mid-word detection: a text node's line boxes where a line ends without a space and the next
  begins mid-token, via `Range.getClientRects` over the word, or simpler: the element's `overflow-wrap` computes to `anywhere`/`break-word` and a word is wider than its box).
Both follow the existing mode table: `/board` and `/` are already in `fail_routes`.

## Tests (red first)
- `web/src/features/plan/components/TonightHero.chooseContrast.test.tsx`: a Button; variant is not tertiary and has a hero rule; label meets 4.5:1 on its own background for 7 accents x 2 schemes.
- `web/src/features/board/boardCss.clock.test.ts`: no `overflow-wrap: anywhere`; date and time sizes derive from `cqi` and the content box; `min-width: 0`.
- `web/src/app/pageLayoutRules.qa1.test.ts`: P10, P11 and the driver probe names.
