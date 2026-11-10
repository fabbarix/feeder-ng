# WP10: Cook Mode and kitchen board (round 2)

Spec: ui-fix-plan 2.7, 5.12, 5.13; QA B13, B14 and the Cook Mode lines. The shell already renders `/board` and `/cook/*` chromeless and full-viewport (WP5). Own folders: `web/src/features/cook/**`, `web/src/features/board/**`. Builds on [t14](t14-cook-board.md).

## Routes (read-only check; they exist, nothing added)
WP9's Cook/Batch entry on Recipe detail links with the helper exported from `features/cook` (`index.ts`):
- `cookRecipePath(recipeId, batches = 1)` gives `/cook/recipe/<id>?batches=<n>`. `?batches` is left out for 1; invalid or <= 0 counts as 1; fractions allowed (`1.5`). Route: `/cook/recipe/:id` (CookScreen) reads `?batches=` via `cookSourceFrom`; API `GET /api/cook/recipes/{id}?batches=`.
- `cookMealPath(date, mealSlotId)` gives `/cook/meal/<YYYY-MM-DD>/<slotId>`.
Exit from a Recipe session returns to `/recipes/<id>`, from a Planned Meal to `/` (`exitPathFor`). Stubs in `lib/scope.ts`, tests `lib/scope.test.ts`.

## Cook Mode layout (2.7)
Top row `CookTopRow` (new): Exit secondary button (X), pill "Step n of N" (Chip kind state, role status), voice `VoiceToggle` restyled as a pressed `IconButton` (Microphone/MicrophoneSlash). No Batches chip for 1 Batch ("2 Batches" is kept in the title line for more), no Screen-stays-awake chip (keep-awake stays silent).
- `StepTile`: overline `stepOverline(step)` ("Passive · 15 min timer"), big text, one muted `Uses 250 g flour, 2 piece onion` line (amounts from `useFormatUse`, scaled by Batches on the server, so metric/imperial follows the User); no list.
- Tablet tap zones are visible: two `[data-zone=back|next]` aria-hidden halves with caret icons; one-time coach mark (`useCoachMark`, localStorage `feeder.cook.coach`) with a "Got it" button.
- `AdvanceStepsTile` becomes a spoil status tile shown only before Step 1 while some Advance Step is pending: "<text> · 4 h ahead" and a "Done" button per row. Once all are done, or after Step 1, it is not shown. Step count: the pill counts only the cooking sequence (Advance Steps excluded), consistently; no "Advance Step done" suffix.
- `CookNavTiles`: Back (1 part) and Next (2 parts) 64 px tiles; last Step's Next is Mark as Cooked (meal) or Back to Recipe (recipe), unchanged.
- `CookTimerStrip`: each timer a `TimerTile` with its own controls (pause or resume IconButton, "Dismiss timer" = cancel/dismiss), 2-up grid, "Timers"/"Other timers" regions kept. This fixes the QA "cancel button shows its aria text": no visible `Cancel timer <label>` text any more.
- `CookedConfirmation`: success status tile with CheckCircle, primary lg "Back to Today".

## Board (5.13)
`lib/layout.ts` `BOARD_LAYOUT`: 4x3, 12 cells, no overlap: Tonight 2x2 hero (accent, `onCook` gives the big "Cook" button, replacing `StartCookTile`, which is deleted), clock, Next Advance Step, Leftovers, Timers, Use soon 2x1 (spoil status chips), Tomorrow, streak. Padding 24, gap 16, radius 32. The coordinates hint is removed from the wall display (`showFallbackHint` deprecated and ignored); it must move to Settings. Heading kept as "Next Advance Step" (glossary term) rather than "Prep ahead".

## Tests (red)
`scope.test`, `steps.test` (stepOverline), `CookTopRow.test`, `VoiceToggle.test`, `StepTile.test`, `AdvanceStepsTile.test`, `CookTimerStrip.test`, `CookedConfirmation.test`, `useCoachMark.test`, `CookScreen.test` (layout, Exit, Batches route, Uses line, Advance tile), board `BoardTiles.test`, `lib/layout.test`.
