# R11b Plan / Today / Cook fixes (design note)

Source: QA report "New bugs" N6-N9 (qa-screens 01 and 05), the R10 review nit on the Cook preview, and the zero-waste streak observation. Tests are written first and are red; stubs only (one signature stub, see N7). R11a owns Settings, shell, Scan, Ingredients and internal/app; none of those are touched. No shared CSS token changes are needed.

## N6 Cooked meals meet WCAG AA (Plan)
Cause: `.plan-meal[data-state='cooked'|'skipped'] { opacity: .55 }` and `.plan-meal__slot { opacity: .8 }` dim text, chip included (slot 2.78:1, Recipe name 3.85:1, Cooked chip 2.56:1).
Design: no opacity on anything under `.plan-meal`. The state is already marked by the chip (`Chip kind=state`, success colours, default Check icon; Not cooked is danger with its icon). In the Cooked and Not cooked states the Recipe name and the slot name take `color: var(--color-muted)` (a quieter tone, not a fade). Pairs, all >= 4.5:1 in every accent and both schemes (computed from `generatePalette` and `STATUS_PALETTE` with the existing `theme/contrast.ts`): muted on surface, text on surface, success fg on bg, danger fg on bg. `.plan-meal__slot` loses its `opacity: .8` (colour `var(--color-muted)` in all states). No strikethrough.
- `plan/plan.css`: drop the opacity rules; add `.plan-meal[data-state='cooked'] .plan-meal__recipe`, `.plan-meal[data-state='skipped'] .plan-meal__recipe`, and the same for `.plan-meal__slot`, with `color: var(--color-muted)`.
- Tests: `plan/cookedContrast.test.ts` (token pairs x accents x schemes, green guard; CSS contract, red), `plan/plan-css.test.ts` (old 55 % test replaced, red), `MealTile.test.tsx` (Cooked chip is success with an icon, green).

## N7 Cook board "Start in 92 h"
Pure lib `board/lib/tiles.ts`: `dueText(dueAt, nowMs, timeZone = 'UTC')`.
- under 1 min or overdue: `now`; under 60 min: `in N min`; under 24 h: `in N h` (floor); at 24 h or more elapsed (exactly 24 h counts): the weekday and time in the household zone, `Sat 11:30`: `Intl.DateTimeFormat('en-GB', {weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23', timeZone})`, output `Sat 11:30` (no comma). Elapsed time is real milliseconds, the wall time comes from the zone, so DST changes never shift the label.
- `NextAdvanceTile` gets an optional `timeZone` prop and passes it; `BoardScreen` passes the household zone it already has (`zone`). The sentence stays `Start ${when}` (`Start in 3 h`, `Start Sat 11:30`).
- Open point, not decided here: past 6 days the weekday repeats; a Planned Meal is at most Planning Horizon (7 days) away, so the Advance Step is at most about a week out. Left as is.
- Stub already in place (so tests typecheck): the `timeZone` parameter (ignored) and the prop. Tests: `board/lib/tiles.test.ts` (boundaries 23:59/24:00, day change in zone, DST both ways, zero padding), `BoardTiles.test.tsx`.

## N8 Layout
- Phone Today, streak tile: `StreakTile`'s Tile gets `className="today-streak"`; `today.css` `.today-streak { align-self: start; }` (the BentoGrid stretches rows, so the tile hugs its content). The slot wrapper is `display: contents`, so the tile is the grid item.
- Phone Today, spoil tile: `SpoiledTile` passes `span="full"` (the Today hierarchy lists it as a full-width tile; a half tile left an empty column). Streak and Use soon keep the half-and-half row.
- Cook Step tile: remove `min-height: 40vh` from the base `.cook-step` rule in `cook/cook.css` (phone: the tile follows its content). The tablet block keeps `flex: 1 0 auto`, so the tablet tile still fills the height.
- Tests: `today/todayCss.test.ts`, `StreakTile.test.tsx`, `stock/components/SpoiledTile.test.tsx`, `cook/cookCss.test.ts` (all red).

## N9 Step pill colour
`CookTopRow`: `<Chip kind="tag" icon="cook">` (neutral: surface-2 background, muted text; 4.5:1 checked in the contrast test). Indigo stays reserved for Pinned. Test: `CookTopRow.test.tsx`.

## Cook preview and servedFromLeftover (R10 review nit)
`internal/plan/httpapi/handlers.go` `cookPreview`: `names.load(r.Context())` -> `names.load(r.Context(), &p.Meal)` so the Leftover lookup runs for the previewed meal (as `cooked` already does). BDD only (the handler needs the whole stack; a step blanks the stored source date and slot of the served meal to mimic a pre-R10 row, since new rows are already filled by Reconcile): `bdd/features/planning/cooked.feature`, scenario "The Cook preview of a meal served from a stored Leftover reports the source date of the Leftover" (red: `meal.servedFromLeftover.date` is "" today).

## Zero-waste streak: product question, no tests
Where: `cook.Streak` (internal/cook/streak.go), served by `GET /api/today/streak` and the board; design in t15-notify-ops-today.md; BDD in notify-ops/today.feature.
Spec: functional-spec section 4 (Stock): "Throw out removes the lot and records the waste, which feeds the zero-waste streak". The code matches it and its design note: streak = whole days since the last waste record (waste today = 0), or, with no waste ever, since the earliest Stock Lot purchase date.
What QA saw is explained by two rules the spec does not settle:
1. A Lot that went off but was not thrown out is not a waste record, so it does not break the streak (spoiled-but-kept is not "waste" until the User says Throw out).
2. The streak starts from the earliest Lot `purchased` date, which the User can backdate, not from when the Household was created; a household seeded today with Lots purchased 3 weeks ago shows 3 wk.
Neither contradicts the spec text, and both are product rules (should a Lot passing its go-off date count as waste? should the streak be capped at the household's age?). Not implemented; questions for the owner. If either is answered "yes", the change is in `cook.Streak` / `dbWaste.FirstActivity` / the stock waste query, plus BDD in notify-ops/today.feature.

## Files
Web: board/lib/tiles.ts, board/components/BoardTiles.tsx, board/screens/BoardScreen.tsx, plan/plan.css, plan/components/MealTile.tsx (no change expected), cook/components/CookTopRow.tsx, cook/cook.css, today/components/StreakTile.tsx, today/today.css, stock/components/SpoiledTile.tsx. Go: internal/plan/httpapi/handlers.go.

## Test list
Red: tiles.test.ts (N7 dueText x7), BoardTiles.test.tsx (N7 tile), plan-css.test.ts (no opacity), cookedContrast.test.ts (CSS contract x3), CookTopRow.test.tsx (tag pill), cookCss.test.ts, todayCss.test.ts, StreakTile.test.tsx (class), SpoiledTile.test.tsx (span full), BDD cook-preview scenario.
Green guards: token-pair contrast, Cooked chip success with icon.
