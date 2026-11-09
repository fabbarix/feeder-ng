# T14 cook-board: design

Scope: functional-spec §11 (Cook Mode, kitchen board), §3 (Location), §14, ux-brief (Cook Mode, Kitchen tablet, Bento), GLOSSARY *Cook Mode*, *Passive Step*, *Advance Step*. Contract: [../architecture.md](../architecture.md). Builds on `internal/recipe/schedule` ([t4](t4-domain-libs.md): `ScaleUses`), Stock waste ([t10](t10-stock.md)), Planning ([t11](t11-planning.md): Planned Meals, `MarkCookedSheet`, `useMarkCooked`, `nextMeal`, `usePlan`, `useLeftovers`; **read from the t11 worktree, the branch is synced after it lands**) and household settings ([t1](t1-auth-household.md): time zone, Location). Tests first (red); the Developer implements until `scripts/check.sh` passes.

## Decisions taken
- **Scope key.** A cook session is addressed by a `scope` string: `meal:<YYYY-MM-DD>/<mealSlotId>` (a Planned Meal, never a row id, as in T11) or `recipe:<id>` (a Recipe with a chosen Batch count). Timers and Advance Step marks hang off a scope. There are no foreign keys (migration `0900_cook.sql`).
- **Advance Step "done" is a persisted per-scope mark** (`advance_step_marks(scope, step, done_at)`), set with `PUT /api/cook/marks`. Marking is idempotent; marking a Step that is not an Advance Step is 422 `not_advance_step`. Cook Mode lists marked ones above the Step as done and the others with a warning ("Not done yet"). A `recipe:` scope has no Planned Meal, so its marks are also what the Recipe's Cook Mode shows next time (they are purged after 2 days by `Store.PurgeOlderThan`, called from the sweep ticker). Meal marks are purged the same way.
- **Timers are server rows, remaining time is computed.** A running timer stores `ends_at`; a paused one stores `remaining_ms`. `Timer.Remaining(now)` is pure; the server uses the injectable `clock.Clock`. Every list/read first **settles** (running and `now >= ends_at` becomes `finished`) and publishes the finish event once. A 1 s ticker in `Mount` (stopped with `Deps.Context` once T11 is synced) calls `Service.Sweep` so the event fires without anybody polling. Clients render `endsAt - (clientNow + skew)` where `skew = serverNow - clientNow` measured from the response's `now`, so a drifting tablet clock still agrees with the phone.
- **Cancel deletes the row** (no `cancelled` state). A finished timer stays listed (the alarm keeps ringing until someone taps Dismiss = cancel). States: `running | paused | finished`.
- **One timer per (scope, Step).** `POST /api/cook/timers` with a `step` returns the existing timer (200) instead of a second one, so phone and tablet reaching the same Passive Step start it once. Free timers (no step) are always new (201). A Passive Step's timer starts when the Step is reached: the Cook Mode hook calls the route once per reached Passive Step.
- **"Timer finished" event.** Topic `timers`, data `{"changed":"timer","kind":"started|paused|resumed|cancelled|finished","timerId":n,"scope":"...","label":"..."}`. The push team subscribes with `service.SubscribeFinished(bus)` (a typed wrapper over `Bus.Subscribe("timers")` that yields only `kind=finished`). Marks publish topic `cook` `{"changed":"marks","scope":...}`. No push is sent by this team.
- **Alarm sound** is a front-end adapter (`AlarmAdapter`, WebAudio beep loop) played when a timer is *seen* to turn `finished` (a state change while the page is open), not for ones already finished at load.
- **Voice** is a `SpeechAdapter` interface (browser `SpeechRecognition` in production, a fake in tests). Off by default; the on/off choice is per device in `localStorage` (`feeder.cook.voice`). `parseCommand` maps transcripts: "next"/"next step" -> next, "back"/"previous"/"go back" -> back, "repeat"/"again" -> repeat, "start timer" -> startTimer, "pause timer" -> pauseTimer; anything else -> null. Case/punctuation insensitive.
- **Wake Lock** is a `WakeLockAdapter` (`navigator.wakeLock` in production, a fake in tests); the hook re-requests it when the page becomes visible again and releases on unmount.
- **Navigation.** Back/Next tiles (full width) always; on the tablet the left half of the step tile = Back, right half = Next (`tapAction(x, rect)`). The last Step's Next tile is replaced by "Mark as Cooked", which opens T11's `MarkCookedSheet` through `useMarkCooked` (only for a `meal:` scope; a `recipe:` scope has no Planned Meal, so it offers "Done" which goes back to the Recipe).
- **Steps shown.** The cooking sequence is the Recipe's non-Advance Steps in order (numbered "Step 2 of 5"); Advance Steps are the "above" list. A Ready Meal with no Steps shows only Mark as Cooked.
- **Uses scaling** is done on the server with `schedule.ScaleUses(uses, batches)` (the web app has no copy of the rule). Uses carry the Ingredient name (looked up from the Recipe's lines) plus quantity and unit as typed; display units follow the User's system through T8's `lineUnits`.
- **Zero-waste streak** (documented here, tested in `internal/cook/streak_test.go`): the number of consecutive complete household days, ending today, without a waste record. `streak = today - max(lastWasteDate, since)` in days, where `lastWasteDate` is the newest `stock_waste.wasted_on` (Throw out `spoiled` and auto-discarded `leftover_discarded` both count, T10) and `since` is the household's first Stock activity (earliest Stock Lot `purchased` date). Waste today -> 0; waste yesterday -> 1; no waste ever -> `today - since`; no Stock Lot and no waste ever -> 0 (nothing to be proud of yet). It is computed on the server (`GET /api/board`).
- **Location is coordinates-only for sunset.** Geocoding a city needs the network, which Feeder never assumes. `Location{city}` alone therefore falls back to 19:00-07:00, exactly like "no Location". `GET /api/board` says why (`theme.source = "sun" | "fallback"`, `theme.reason = "no_location" | "city_only" | ""`) and the board shows a small Chip "Add coordinates in Settings for sunset" in the fallback case. (T1's Location hint copy should mention coordinates; see QUESTIONS.)
- **Dark/light is decided on the server** by `sun.PhaseAt` so there is one algorithm (Go). The response carries `theme.dark` and `theme.nextChangeAt`; the board sets one `setTimeout` for the change and refetches on reconnect. Polar day -> always light, polar night -> always dark (`nextChangeAt` = next local midnight). The board overrides the User's scheme preference on `/board` only.
- **Sunrise/sunset** = NOAA solar-calculator algorithm (Meeus-based; zenith 90.833 deg, so refraction and the solar disc are included). Unit tests use reference values (timeanddate.com / NOAA calculator) with a 4 minute tolerance.
- **Board data** comes from existing APIs plus one new route: plan (`usePlan`: tonight's and tomorrow's Planned Meals), Leftovers (`useLeftovers`), Stock totals with `useSoon` (`GET /api/stock`), timers, and `GET /api/board` (`{now, today, theme, streak, nextAdvance}`). `nextAdvance` is computed server-side by the pure `cook.NextAdvance`: of all Planned Meals from today on whose Advance Steps are not marked done, the one with the earliest due time (`meal time - leadTime`); overdue ones sort first.
- **Chromeless routes.** `/board` and `/cook/...` render without the bottom bar / side rail (the board is a wall display; Cook Mode wants the whole screen). Small shared change: `web/src/app/chromeless.ts` (`isChromeless(pathname)`), used by `AppShell` (listed in the report).
- **Everyone signed in** may use every route (`r.User`), as for Stock and Planning.

## Data
Migration `0900_cook.sql` (written in this commit): `cook_timers`, `advance_step_marks`.

## API (JSON camelCase; errors `{"error":{"code","message"}}`; all `r.User`)
Timer = `{id, scope|null, step|null, label, durationSeconds, state, remainingSeconds, endsAt|null, startedAt}`. `remainingSeconds` is rounded up; `endsAt` is null while paused.

| Route | Result |
|---|---|
| `GET /api/cook/meals/{date}/{slotId}` | CookView for a Planned Meal; 404 `not_found`; 409 `not_cookable` when its state is not `planned` |
| `GET /api/cook/recipes/{id}?batches=2` | CookView for a Recipe; `batches` defaults to 1; 422 `validation_failed` (batches not finite or <= 0); 404 `not_found` |
| `PUT /api/cook/marks` `{scope, step, done}` | 200 `{scope, step, done, doneAt\|null}`; 422 `invalid_scope`, `not_advance_step`; 404 `not_found` (unknown Recipe or Planned Meal) |
| `GET /api/cook/timers[?scope=]` | `{now, timers:[Timer]}` ordered by remaining time, running first, then paused, then finished |
| `POST /api/cook/timers` `{scope?, step?, label?, durationSeconds?}` | 201 Timer (200 the existing one for the same scope+step). With `step`, `scope` is required and the label/duration default from the Passive Step (422 `not_passive_step` otherwise). Free timer: `label` and `durationSeconds` (1..86400) required, else 422 `validation_failed` |
| `POST /api/cook/timers/{id}/pause` | 200 Timer; 409 `not_running`; 404 |
| `POST /api/cook/timers/{id}/resume` | 200 Timer; 409 `not_paused`; 404 |
| `DELETE /api/cook/timers/{id}` | 204 (cancel, or dismiss a finished one); 404 |
| `GET /api/board` | `{now, today, theme:{dark, nextChangeAt, source, reason}, streak:{days}, nextAdvance:null\|{scope, recipeName, step, text, leadTimeMinutes, dueAt, overdue, mealDate, mealSlotId, slotName}}` |

CookView = `{scope, recipeId, recipeName, batches, meal:{date,mealSlotId}|null, advance:[{step, text, leadTimeMinutes, done, doneAt|null, warning}], steps:[{index, number, of, kind, text, durationMinutes, imageUrl, uses:[{ingredientId, ingredient, quantity, unit}], timer:null|{label, durationSeconds}}], timers:[Timer]}`. `index` is the Recipe step index (what marks and timers use); `uses.quantity` is already scaled by Batches; `timer` is set only on Passive Steps. `warning` is `!done`.

Events: `timers` and `cook` as above. The board refreshes on SSE topics `plan`, `stock`, `timers`, `cook`.

## Go layout and signatures (tests rely on these)
- `internal/sun` (pure): `Coords{Lat, Lon}`, `Day{Sunrise, Sunset time.Time; State DayState}` (`Normal | PolarDay | PolarNight`), `Times(year int, month time.Month, day int, c Coords) Day` (instants in UTC for the *local solar day* of that civil date), `Phase{Dark bool; Next time.Time; Source Source}`, `PhaseAt(now time.Time, zone *time.Location, c *Coords) Phase` (nil `c` = fallback 19:00-07:00 local; `Next` is strictly after `now`). Tests `sun_test.go`.
- `internal/cook` (pure): `Timer`, `TimerState`, `StartTimer`, `Timer.Remaining/RemainingSeconds/Pause/Resume/Settle`, `Scope`, `MealScope`, `RecipeScope`, `ParseScope`, `BuildView`, `TimerLabel`, `NextAdvance`, `Streak`, sentinels (`ErrInvalidDuration`, `ErrNotRunning`, `ErrNotPaused`, `ErrInvalidScope`, `ErrNotAdvanceStep`). Tests `timer_test.go scope_test.go view_test.go advance_test.go streak_test.go`.
- `internal/cook/store`: `Store` over SQLite (`InsertTimer Timer Timers StepTimer SaveTimer DeleteTimer SetMark Marks PurgeOlderThan`), `ErrNotFound`. Tests `store_test.go` (temp DB via `cooktest.NewDB`).
- `internal/cook/service`: `Service` with ports `Recipes`, `Meals`, `Waste`, `Household` in `ports.go` (fakes in tests); methods `MealView RecipeView SetMark Timers StartTimer Pause Resume Cancel Sweep Board`; `SubscribeFinished`. Tests `service_test.go` (fake clock, real store, real `events.Bus`). Real adapters (`adapters.go`: recipe store, planned meals read from T11's tables, stock waste/lots, household store) are the Developer's.
- `internal/cook/httpapi` (module `cook`) + `internal/modules/cook.go`: currently every route answers 501 (stub).
- `internal/cook/cooktest`: `NewDB`.
- BDD: `bdd/features/cook-board/{cook_mode,timers,board}.feature`, steps `bdd/steps_cook_board_test.go` (`RegisterSteps("cook-board")`, all step text phrased with "Cook Mode" / "kitchen board" / "timer"). Scenarios that start from a Planned Meal need T11 merged in (`PUT /api/plan/{date}/{slotId}`) and stay red until the sync.

## Frontend
`web/src/features/cook` (routes `/cook/meal/:date/:slotId`, `/cook/recipe/:id`, the latter reading `?batches=`):
- `lib/` (pure, tested): `steps.ts` (`createNav`, `goNext`, `goBack`, `isFirst`, `isLast`, `tapAction`, `stepLabel`), `timers.ts` (`measureSkew`, `remainingSeconds`, `sortTimers`, `finishedIds`, `newlyFinished`), `voice.ts` (`parseCommand`), `advance.ts` (`advanceSummary`).
- `adapters/`: `speech.ts` (`SpeechAdapter`, `createBrowserSpeech`), `wakeLock.ts` (`WakeLockAdapter`, `createWakeLock`), `alarm.ts` (`AlarmAdapter`, `createWebAudioAlarm`), plus `fakes.ts` for tests.
- `hooks/`: `useTimers(scope?)` (react-query + SSE `timers` + a 1 s tick from an injectable `now`; `start/pause/resume/cancel`), `useCookSession(source)` (CookView, step index, navigation, auto-start of a reached Passive Step's timer, marks), `useWakeLock(adapter)`, `useVoiceCommands({adapter, enabled, onCommand})`, `useTimerAlarm(timers, alarm)`, `useVoicePreference()`.
- `components/` (render + wire only, from `Tile`, `BentoGrid`, `Chip`, `Button`, `TimerTile`): `StepTile` (tap halves), `AdvanceStepsTile`, `CookNavTiles`, `CookTimerStrip`, `VoiceToggle`. `screens/CookScreen` composes them and `MarkCookedSheet` from `features/plan`. Copy in `strings.ts`.

`web/src/features/board` (route `/board`):
- `lib/tiles.ts` (pure): `tonightMeal(slots, today, nowIso)`, `tomorrowMeals(slots, today)`, `useSoonRows(totals, max)`, `leftoverRows(leftovers, max)`, `clockText(now, zone)`, `streakText(days)`, `msUntil(nextChangeAt, now)`.
- `hooks/`: `useBoard()` (GET /api/board, SSE topics `plan stock timers cook`, refetch on reconnect), `useBoardScheme(theme, now)` (timer to `nextChangeAt`), `useNow(tickMs)`.
- `components/`: `ClockTile`, `TonightTile`, `NextAdvanceTile`, `LeftoversTile` (own), `UseSoonTile`, `BoardTimersTile`, `TomorrowTile`, `StreakTile`, `StartCookTile` (big button). `screens/BoardScreen`: `BentoGrid columns={4}` 4x3 with big type (`board.css`, >= 3rem for the clock and meal names, >= 1.5rem for body text).
- `app/chromeless.ts` is the only shell change.

## Shared files touched
`web/src/app/AppShell.tsx` (hide nav when `isChromeless`), new `web/src/app/chromeless.ts` (+ test). `internal/modules/cook.go` is owned. Nothing else shared.
