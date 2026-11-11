# GW: "Good until" wording for go-off dates

Spec: functional-spec 6.1 (a Lot is fine on its go-off date and goes off on go-off date + 1), 7 (why chips), 12 (notifications). GLOSSARY: "Go-off date / Good until".

## Decision

Forward copy names the **last good day**, which is the go-off date itself. Past copy is unchanged.

| Surface | Before | After |
|---|---|---|
| Stock Lot chip (`describeGoOff`) | Goes off today / tomorrow / in N days | Good until today / tomorrow / Thu (2 to 6 days) / 16 Nov (7+ days) |
| Stock row meta (`goOffPhrase`) | goes off today / tomorrow / Thu / 20 Nov | good until today / tomorrow / Thu / 20 Nov |
| Today Use soon row (`whenWording`) | Spinach · Thu (today, tomorrow) | Spinach · good until Thu (good until today, good until tomorrow) |
| Notification (`internal/notify/compute.go`) | "Spinach goes off tomorrow and no Planned Meal uses it" | "Spinach is good until today and no Planned Meal uses it" |
| Planner chip (`whyUsesBefore`) | uses spinach before Thu | uses spinach by Thu |
| Past (unchanged) | Went off today / yesterday / N days ago | same |

Weekday vs date: 2 to 6 days ahead is a short en-GB weekday, 7 or more a day and month, matching `goOffPhrase` today. `describeGoOff` gains the same formatting (reuse the formatters from `filter.ts`; do not duplicate).

## Notification text

The push fires at 10:00 on the go-off date, so on that day the last good day is **today**. The brief quoted "good until tomorrow"; that would be wrong at send time (it would push the last good day out by one). The text is therefore "X is good until today and no Planned Meal uses it". Timing is unchanged. Flag to the user.

## Planner chip

`Why.Date` for `perishable_use` is already the lot's go-off date (`stockFacts.atRiskDay` is the earliest `goesOff`), so the Go side needs no change; a regression test pins it. The web phrase "uses X before Thu" read one day early (the Lot is still fine on Thu). Chosen: **"uses X by Thu"**, keeping the go-off date. "By" includes the day, matching "Good until Thu"; the alternative (keep "before" and send go-off + 1) would make the API date a day the Lot has already gone off and would break `leftover`/other date semantics sharing `Why.Date`. Only `whyUsesBefore` (rename to `whyUsesBy`) changes in `web/src/features/plan/strings.ts` and `phrase.ts`.

## Implementation notes for the Developer

- `web/src/features/stock/strings.ts` `goesOff`: forward keys become `goodUntil.today/tomorrow/on`; keep the past keys. `describeGoOff` and `goOffPhrase` use them. Capitalisation: Lot chip capitalised, row meta lowercase (after the " · ").
- `web/src/features/today/lib/useSoon.ts` `whenWording` returns "good until today|tomorrow|<Thu>" (strings in `today/strings.ts`). The `UseSoonItem.when` field keeps its name.
- `internal/notify/compute.go` body text; fix the stale comment.
- `web/src/ui/Gallery.tsx` sample text "Goes off Thu" should read "Good until Thu" (not a test).
- Do not touch the "wait" glossary entry, CHANGELOG, `web/src/features/scan`, `internal/scan`.

## Tests (red until implemented)

- `stock/lib/view.test.ts`, `stock/lib/filter.test.ts`: boundaries today, tomorrow, weekdays, 7+ days, past dates.
- `stock/components/{StockRow,LotList}.test.tsx`, `stock/screens/StockScreen.test.tsx`: rendered wording.
- `today/lib/useSoon.test.ts`: Use soon phrase.
- `internal/notify/compute_test.go`, BDD `notify-ops/push_delivery.feature`: notification text.
- `plan/lib/phrase.test.ts`, `chips.test.ts`, `SwapSheet.test.tsx`, `PlannedMealSheet.test.tsx`: "by Thu".
- `internal/planner/why_test.go`: Why.Date is the go-off date (already green; regression).
