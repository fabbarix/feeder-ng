# TG-API: the Tags API (design note)

Task TG-API of [tg-plan.md](tg-plan.md) (§3.1, §3.1a, §4.1, §4.3), spec §4.1 and §17, decisions in [ADR 0010](../../adr/0010-tags-as-entities.md), store in [tg-a.md](tg-a.md), web expectations in [tg-ui.md](tg-ui.md). Backend only: `internal/tag/httpapi`, `internal/modules/tags.go`, the move of `GET /api/tags`, one new store method, BDD. No TG-R (`tag_unknown` on rule routes), web, GLOSSARY, CHANGELOG or spec.

User decisions, final: Delete confirms (naming the Recipes and rules it touches, offering "Merge instead") and never refuses; Tags are ordered by name; colours repeat after 10.

## What the test author left, and what the developer does

| Piece | State | Developer work |
|---|---|---|
| `internal/tag/httpapi/httpapi.go` | package, `init` registering the `tags` module, `api{d, st}`; every route but `GET /api/tags` mounted on a handler that answers `501 not_implemented` | Write the handlers (below), split them over `handlers.go` and `shapes.go` as `internal/course/httpapi` does. |
| `internal/modules/tags.go` | real (blank import) | none |
| `GET /api/tags` | still served by `internal/recipe/httpapi` (the new package must not register it twice: the mux panics) | Register it in the new package; delete the route, `a.tags` and `tagJSON` from `internal/recipe/httpapi/httpapi.go`, then `Tags` and `TagCount` from `internal/recipe/store/store.go` and its tests once unused. |
| `internal/tag/store.BothRecipes` | stub returning an error | Implement it (below). |

## Routes (spec §17; every one `r.User`, so a signed-in User who is not an Admin)

| Route | Answer | Errors |
|---|---|---|
| `GET /api/tags` | the array of `tagJSON`, by name, `[]` when none | |
| `POST /api/tags` `{name, colour?}` | `201` `tagJSON` | `422` / `409` below |
| `PATCH /api/tags/{id}` `{name?, colour?}` | `200` `tagJSON` | `404`, `422`, `409` |
| `GET /api/tags/{id}/impact[?into=<id>]` | `impactJSON` | `404`, `422` for `into` |
| `POST /api/tags/{id}/merge` `{into}` | `200` the target's `tagJSON` (new counts) | `404`, `422` |
| `DELETE /api/tags/{id}` | `204` | `404` |

- **`tagJSON`**: `{id, name, key, colour, recipes, slotRules, varietyRule}` (`tag.Listing`). Create, update and merge answer with the same shape, found by listing (or `Get` plus counts) after the write, as `internal/course/httpapi` does. `recipes` and `name` keep their meaning, so an older SPA reads the list.
- **`impactJSON`**: `{recipes, slotRules: [{id, mealSlotId, mealSlotName, weekday, courseId, courseName, tag}], varietyRule: {tag, maxPerWeek, notConsecutiveDays} | null, bothRecipes?}`. `slotRules` is `[]` (never `null`) and `varietyRule` is `null` when none. `slotRules` carries `id`, `mealSlotId`, `courseId` and `tag` as `GET /api/slot-rules` does; the names and weekday are extras from `tag.ImpactSlotRule` so the confirm can write "Friday Dinner · Main = fish" without a second call.
- **`bothRecipes`** (PM decision, for the merge confirm "(4 already have both)"): present only with `?into=<id>`, from `store.BothRecipes(id, into)`. It is an integer, `0` included. An `into` that is not a number, is the Tag itself or is unknown is `422 validation_failed`, `field: into`; an unknown `{id}` is `404` whatever `into` says.
- **`store.BothRecipes(ctx, id, into) (int, error)`**: the Recipes (archived included) that carry both Tags; `tag.ErrNotFound` for `id`, then `tag.ErrMergeSelf`, then `tag.ErrMergeTarget`. Tests: `internal/tag/store/both_test.go`.

## Errors (one body shape, `{"error": {...}}`, as `internal/course/httpapi`)

| Case | Status | Body |
|---|---|---|
| `tag.ErrNotFound`, or an `{id}` that is not a number | 404 | `code: not_found` |
| `tag.ErrNameInvalid` | 422 | `code: validation_failed`, `field: name`, `reason: tag_invalid` |
| `tag.ErrColourUnknown` | 422 | `code: validation_failed`, `field: colour`, `reason: colour_unknown` |
| `PATCH` with neither `name` nor `colour` | 422 | `validation_failed`, `field: name`, `reason: nothing_to_change` (as Courses) |
| `tag.ErrMergeSelf`, `tag.ErrMergeTarget`, a missing or zero `into` | 422 | `validation_failed`, `field: into` |
| `*tag.NameTakenError` | 409 | `code: tag_name_taken`, and `tag: {id, name, colour}` **inside the `error` object** (the other Tag) |
| a body that is not JSON | 400 | `bad_request` (`httpx.DecodeJSON`) |

A refused request changes nothing (the store checks before writing) and publishes nothing.

## Events (tg-plan §3.1a; after the commit, in this order)

1. `tags` on every successful write (create, update, merge, delete).
2. `recipes` on a successful update that has a `name`, and on every merge and delete. A colour-only update, and create, do not publish it.
3. `plan.invalidate {"reason":"rules_changed"}` via `plan.Invalidate(d.Events, plan.ReasonRulesChanged)`, last, only when `Result.RulesChanged`. Last, because `Runner.Invalidate` coalesces and keeps the last reason, and a `recipes`-only replan keeps the unpinned meals a rule placed.

`tags` and `recipes` carry `{"changed":"tags"}`. A `PATCH` with a `name` counts as a rename even when it only respells (the handler does not compare names); it publishes `tags`, `recipes`, and no `plan.invalidate` (a respell moves no rule). Dropping only the source's Variety Rule in a merge is `RulesChanged`. Reads publish nothing.

## Handlers stay thin

Parse, call the store, respond: no key arithmetic, no rule logic, no SQL. The handler maps errors to the table above, calls `ctx` store methods, and decides events from the request shape and `Result.RulesChanged`. Importing `internal/plan` (types and `Invalidate` only) is allowed; `internal/plan/store` and `internal/recipe` are not needed.

## Tests

| File | Covers |
|---|---|
| `internal/tag/httpapi/tags_test.go` | signed-in only (anonymous 401), the list (array, name order, counts with archived Recipes, old fields, `[]`), create (next colour, chosen colour, repeat after ten, refusals, `tag_name_taken` naming the other Tag), rename with rules following, respell, recolour, update refusals changing nothing, impact (order, counts, `bothRecipes`, empty case), merge (every outcome of the `Merge` table through the API), delete (never refused, other Tags' rules stay) |
| `internal/tag/httpapi/events_test.go` | the event table above, one subtest per case, one subscription on the three topics so the order is the order; refusals and reads publish nothing |
| `internal/tag/store/both_test.go` | `BothRecipes` |
| `bdd/features/tags/tags.feature` | the same through the whole app as a User who is not an Admin |
| `bdd/features/tags/tags_plan.feature` | with the runner wired: deleting `fish` clears the unpinned Friday meal its Slot Rule placed (the `slot_rule` chip goes) while a Pinned meal stays; renaming keeps the rule's meal; a Variety Rule holds after a rename |
| `bdd/steps_tg_test.go` | the new steps, prefixed by what they do; planning scenarios reuse the planning steps |

Existing tests stay unchanged and must keep passing, among them the recipes step "I list the Tags" (same route, same `name` and `recipes`).

## Not done here

TG-R (`tag_unknown` on `POST /api/slot-rules` and `PUT /api/variety-rules/{tag}`), the SPA (`invalidateTagCaches`, the Tags page), GLOSSARY, CHANGELOG and the spec text.
