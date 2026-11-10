# R12 Reheat

Status: design and red tests (step 1 of the pipeline). Branch `team/r12-reheat`.

## Decision (user)

When today's hero shows a Planned Meal served from a Leftover, it offers a **Reheat** button. Reheat opens a screen
with a short reheating timer (adjustable), then lets the User mark the meal as done, which consumes the Leftover.
Today the hero shows only the "Leftover from <day>" chip for such a meal.

## What exists today (checked in code)

- `lib/hero.ts` `heroSelection` gives `action: 'leftover'` for any meal with `servedFromLeftover`; `TonightHero` then
  renders only the chip (before the slot time) or `Yes, Cooked` / `Adjust` (after it).
- **Cooked of a Leftover meal already does what is needed.** `runner.Cooked` for a non-fresh meal (`!m.Fresh()`):
  marks the meal Cooked, takes the portions the meal needed off the source Leftover (floor 0), unpins misfits, and
  does **not** touch Stock. Stock was deducted when the source Batch was Cooked, and spec section 6 says Leftover
  meals need nothing. So "updates Stock as Cooked does for Leftover meals" means: Stock is left alone. Reheat reuses
  Cooked unchanged. `OnResolved` (`internal/plan/httpapi`) then calls `CancelScope(meal:<date>/<slot>)`, which deletes
  every timer of that Planned Meal (any state), so the Reheat timer is cancelled exactly as for Cooked (N4).
- The `yes, Cooked` quick path (`useCookFlow.quickCook`) already sends no Leftover portions for `preview.fresh === false`.
- `cook.Service.MealView` returns `ErrNotCookable` (409 `not_cookable`) for a meal with `Batches <= 0`. A Leftover meal
  has no Steps, so Cook Mode (`/cook/meal/...`) cannot open it, and `internal/cook/service/service.go` is off limits
  this round (R11c). Timers do not need it: a free timer with a `meal:` scope is accepted by `StartTimer` without a view.

Conclusion: **no backend change.** The BDD feature below pins the behaviour Reheat depends on.

## Decisions

1. **Name.** "Reheat" is a new verb for an action, not a state, so it is a new GLOSSARY entry (see Docs to apply).
   The meal is still finished with **Mark as Cooked**, because GLOSSARY `Cooked` says `_Avoid_: Done, eaten, completed`.
   The button on the Reheat screen is therefore "Mark as Cooked"; the hero's after-slot-time question stays "Yes, Cooked".
2. **A screen of its own, not Cook Mode.** A Leftover meal has no Steps (above), so a new route
   `/cook/reheat/:date/:slotId` (chromeless: the `/cook` prefix already hides the bars) in `features/cook`. It is
   the "Cook Mode for that Leftover" of the user decision, as a timer-only view. Shared primitives only (`Tile`,
   `Button`, `Chip`, `Icon`, `EmptyState`); the timer face reuses Cook's timer formatting.
3. **Reheating duration.** The Recipe has no reheat field (only `cookMinutes`, the cooking time, which says nothing
   about reheating), so none is derived from it. Default from the portions the Planned Meal serves:
   `120 s` for one portion, `+60 s` per further portion (fractions rounded up), capped at `600 s`
   (`defaultReheatSeconds`). Adjustable by 30 s steps between 30 s and 30 min (`adjustReheatSeconds`) before the timer
   starts. No new setting, no new Recipe field.
4. **Timer.** A free timer (`step: null`) with label "Reheat", `scope = meal:<date>/<slot>`, created through the
   existing `POST /api/cook/timers`. Free timers do not dedupe by Step, so the hook looks for the meal's existing
   Reheat timer first (`reheatTimerOf`) and never starts a second one; reopening the screen resumes the same timer.
   It syncs between devices and fires the existing alarm like any timer.
5. **Hero rules (`heroSelection`).** `action: 'reheat'` when the hero meal is served from a Leftover and its day is
   `today`; a Leftover meal tomorrow or later stays `'leftover'` (chip only: it may not be marked Cooked yet and
   reheating it today is pointless). Before the slot time the one primary button is `Reheat` (icon `timer`). After the
   slot time the hero asks "<Recipe> cooked?": `Yes, Cooked` (primary) plus `Reheat` (secondary) **in place of `Adjust`**,
   because a Leftover meal has no Leftover portions to adjust.
6. **Icon.** `web/src/ui` is off limits this round, so the button uses the existing Phosphor `timer` icon
   (`TimerIcon`). A dedicated `reheat` icon (e.g. Phosphor `Fire`/`Thermometer`) can come later with a one-line change in `ui/icons.ts`.
7. **Reheat then Exit/back.** Exit goes to Today and leaves a running timer running (like Cook Mode: timers are
   household-wide). The meal stays planned and the Leftover untouched. `Cancel timer` deletes the timer and stays on the
   screen. Nothing is consumed until Mark as Cooked.
8. **Mark as Cooked.** One tap: `quickCook(key)` (preview, then `POST .../cooked` with `{}`), success toast "Cooked, nice
   one!", then navigate to Today. On failure the existing error toast shows, the screen stays and nothing changes. The
   developer may make `quickCook` resolve `true`/`false` (or return the result) so the screen knows whether to leave.
   Cooked removes the Reheat timer on the server; the timers query is invalidated by the `timers` SSE topic.
9. **Not a Leftover meal / already resolved.** The screen shows an `EmptyState`: "This Planned Meal is not served from a
   Leftover" or "This Planned Meal has already been cooked or skipped" (existing `cookStrings.notCookable`).

## Flow

```
Today hero (Leftover meal, today)  --Reheat-->  /cook/reheat/:date/:slot
   [Exit] ........................... Today (timer, if started, keeps running)
   time  3:00  [- 30 s] [+ 30 s]      (before start)
   [Start timer]  ->  3:00 counts down   [Pause|Resume] [Cancel timer]
   [Mark as Cooked] -> POST .../cooked {} -> Leftover portions consumed, Stock untouched,
                       meal timers cancelled (OnResolved) -> Today
```

## API changes

None. Uses `GET /api/plan` (the meal and its `portions`, `servedFromLeftover`), `GET/POST/DELETE /api/cook/timers`,
`POST /api/cook/timers/{id}/pause|resume`, `GET /api/plan/{date}/{slot}/cook`, `POST /api/plan/{date}/{slot}/cooked`.

## Files (developer)

Stubs and red tests are already in the tree; replace the `throw new Error('R12: ...')` stubs.

| File | Change |
| --- | --- |
| `web/src/features/cook/lib/reheat.ts` | implement `defaultReheatSeconds`, `adjustReheatSeconds`, `reheatTimerOf`, `cookReheatPath` |
| `web/src/features/cook/hooks/useReheat.ts` | implement `useReheat(key, portions)` over `useTimers()` and `lib/reheat` |
| `web/src/features/cook/screens/ReheatScreen.tsx` | the screen (render and wire only); data from `usePlan()` (find the slot by date and slot id), `useReheat`, `useCookFlow().quickCook`, `useNavigate` |
| `web/src/features/cook/strings.ts` | `reheat`, `startTimer`, `pause`, `resume`, `cancelTimer`, `add30`/`remove30` ("Add 30 seconds", "Remove 30 seconds"), `notALeftover` |
| `web/src/features/cook/index.ts` | add the route `/cook/reheat/:date/:slotId`; export `cookReheatPath` |
| `web/src/features/cook/cook.css` | small `.reheat-*` rules (tokens only, no native controls) |
| `web/src/features/plan/lib/hero.ts` | `heroSelection`: `'reheat'` for a Leftover meal today |
| `web/src/features/plan/components/TonightHero.tsx` | render `Reheat` (`icon="timer"`) per the rules above; `onReheat` already declared as an optional prop |
| `web/src/features/plan/strings.ts` | `reheat: 'Reheat'` |
| `web/src/features/plan/hooks/useCookFlow.ts` | `quickCook` resolves a success flag |
| `web/src/features/today/components/TodayScreen.tsx` | pass `onReheat={(k) => navigate(cookReheatPath(k))}` |
| `GLOSSARY.md`, `docs/spec/functional-spec.md` | see Docs to apply (after R11c merges) |

Nothing in `internal/`, `web/src/ui` or the off-limits features is needed.

## Tests

Red (need production code):

- `plan/lib/hero.reheat.test.ts`: today's Leftover meal gives `reheat` (also after the slot time); tomorrow's stays `leftover`; a fresh meal stays `cook`. Needs the `heroSelection` change.
- `plan/components/TonightHero.reheat.test.tsx`: primary Reheat button with an icon and `onReheat(key)`, no Cook, chip kept; after slot time `Yes, Cooked` + secondary `Reheat`, no `Adjust`; none for `leftover`. Needs the TonightHero rendering.
- `cook/lib/reheat.test.ts`: default time (2 min, +1 min per portion, cap 10 min, bad input, fractions), adjust clamps, `reheatTimerOf` filtering, path. Needs the lib.
- `cook/hooks/useReheat.test.tsx`: default and adjust, start posts `{scope, label: 'Reheat', durationSeconds}`, no second timer, ignores other timers, pause/resume/cancel. Needs the hook.
- `cook/screens/ReheatScreen.test.tsx`: content, +/- 30 s, Start posts the scoped timer, running state controls, Cancel timer, Mark as Cooked one-tap with `{}` body then Today, failure stays, Exit keeps the timer, not-a-Leftover and already-Cooked explanations. Needs the screen.
- `today/components/TodayScreen.reheat.test.tsx`: Reheat on the Today hero opens `/cook/reheat/...` and no Cook button. Needs the Today wiring.

Green regression guards (backend already behaves this way): `app/chromeless.test.ts` row for `/cook/reheat/...`, and `bdd/features/planning/reheat.feature` (steps in `bdd/steps_reheat_test.go`): a Leftover meal is `not_cookable` in Cook Mode; the Reheat timer is scoped to the meal; Cooked consumes the Leftover, leaves Stock alone and cancels the meal's timers (not free timers); cancelling the timer changes nothing else; Not cooked cancels it too.

## Docs to apply (after R11c merges; do not edit now)

**GLOSSARY.md**, in the Cook Mode area, after `Cook Mode`:

```
**Reheat**:
Warming a Leftover for the Planned Meal it is served at, with a short timer before the meal is marked Cooked; a Leftover has no Steps, so it uses its own screen rather than Cook Mode.
_Avoid_: Microwave, warm up
```

**docs/spec/functional-spec.md**, section 8 "Cooked and Leftovers", add as a bullet after the Not cooked bullet:

```
- A Planned Meal served from a Leftover that is due today offers **Reheat** on Today. Reheat opens a screen with a reheating timer scoped to that Planned Meal (default 2 minutes for one portion plus 1 minute for each further portion, at most 10 minutes; adjustable by 30 seconds, from 30 seconds to 30 minutes). Mark as Cooked then takes the portions off the Leftover and leaves Stock unchanged (Stock was deducted when the Batch was Cooked); like any Cooked or Not cooked, it cancels the Planned Meal's timers, the Reheat timer included. Leaving the screen early keeps the timer running and consumes nothing.
```

and in section 11 after the Cook Mode bullet: "A Planned Meal served from a Leftover has no Steps and does not open Cook Mode; it uses Reheat (section 8)."

## Product questions (defaults taken)

1. After the slot time, Reheat replaces Adjust (a Leftover meal has nothing to adjust). Say if Adjust should stay.
2. Reheat is offered only for today's meal, not tomorrow's Leftover meal.
3. Default time rule (2 min + 1 min per extra portion, cap 10) is a guess; there is no Recipe data to derive it from.
4. The `timer` icon stands in for a dedicated Reheat icon until `web/src/ui` is free.
