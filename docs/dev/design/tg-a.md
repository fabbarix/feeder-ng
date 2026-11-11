# TG-A: Tags data and domain (design note)

Task TG-A of [tg-plan.md](tg-plan.md) (§3.1, §3.1a, §4.1, §4.3), decisions in [ADR 0010](../../adr/0010-tags-as-entities.md). Backend only: migration 1440, `internal/tag`, `internal/tag/store`, and the two small `internal/recipe` edits. No httpapi, web, GLOSSARY, CHANGELOG or spec.

User decisions, final: Delete confirms (naming the Recipes and rules it touches, offering "Merge instead") and never refuses; Tags are ordered by name; colours repeat after 10; unused Tags stay.

## What the test author left, and what the developer does

| Piece | State | Developer work |
|---|---|---|
| `internal/db/migrations/1440_tags.sql` | absent (red) | Create it as tg-plan §2 gives it (plain SQL). |
| `internal/tag/tag.go` | types, errors, `Palette`, `NameKey`, `CleanName`, `ValidColour` real; `NextColour` and `Merge` are stubs | Implement `NextColour` and `Merge`. |
| `internal/tag/store/store.go` | API and doc comments, every method a stub returning an error | Implement against the tests. |
| `internal/recipe/recipe.go` | untouched | `TagKey` returns `tag.NameKey(name)` (drop the local `collapse` use if it becomes unused). |
| `internal/recipe/store/store.go` | untouched | `writeContent` calls `tagstore.EnsureTx`; delete `upsertTag`. Keep `Tags` and `TagCount` (TG-API removes them). |

`internal/tag` must not import `internal/recipe`, and `internal/tag/store` imports neither `internal/recipe` nor `internal/plan/store`. `internal/recipe/store` imports `internal/tag/store`.

## Pure API (`internal/tag`)

- `NameKey`, `CleanName` (1 to 40 runes, case kept, spaces collapsed, `ErrNameInvalid`), `Palette` (ten ids), `ValidColour`.
- `NextColour(counts map[string]int) string`: the palette colour with the fewest Tags, ties in palette order; ids outside the palette in `counts` are ignored; a missing palette id counts as 0.
- `Slot{MealSlotID, CourseID}`, `RuleSet{Slots, Variety bool}`, `MergeOutcome{MoveSlots, DropSlots, MoveVariety, DropVariety}`, `Merge(src, into)`:
  - a source Slot Rule whose Meal Slot and Course the target already has is dropped; the others move, in input order; a Slot repeated in `src` is handled once;
  - the source's Variety Rule moves only when the target has none; if both have one, the source's is dropped (the target's wins); if only the target has one, nothing happens;
  - inputs are not modified.
- Errors: `ErrNotFound`, `ErrNameInvalid`, `ErrColourUnknown`, `ErrMergeSelf`, `ErrMergeTarget`, and `*NameTakenError{Tag}` (use `errors.As`; names the other Tag).
- Types for the API: `Tag{ID, Key, Name, Colour}`, `Listing` (Tag plus `Recipes`, `SlotRules`, `VarietyRule bool`), `Impact` (Tag, `Recipes`, `SlotRules []ImpactSlotRule`, `VarietyRule *ImpactVariety`).

## Repository API (`internal/tag/store`)

`New(*sql.DB)`; `List`, `Get`, `Create(name, colour)`, `Update(id, name, colour *string) (Result, error)`, `Impact`, `Merge(id, into) (Result, error)`, `Delete(id) (Result, error)`, `Exists(key)`; and the package function `EnsureTx(ctx, tx, name) (int64, error)`. `Result{Tag, RulesChanged}`; `RulesChanged` is true only when a Slot Rule or Variety Rule was moved or removed (so a rename where the old key had no rules, or a respell, is false). Merge and Delete return a zero `Tag`.

Behaviours the tests pin:

- `List` is ordered by `lower(name), id`, counts archived Recipes, and returns an empty non-nil slice. `Exists` takes a key (the caller applies `NameKey`).
- `Create`: refusals in order name, colour, taken; empty colour takes `NextColour` over the current counts in the same transaction; counts of colour ids outside the palette are ignored.
- `Update` checks everything before writing, so a refused update changes nothing (not the colour either). A new spelling with the same key changes the name only and touches no rule. A new key: `UPDATE tags`, then the rules on the old key move as `tag.Merge` says against the rules already on the new key, read from `slot_rules` and `variety_rules` by key (an orphan key has no Tag row). A key held by another Tag: `*NameTakenError`, nothing changes.
- `Merge`: the Recipe links, the Slot Rules and the Variety Rule as in ADR 0010 point 5, and the same by-key reading for the target's rules. Merge into itself is `ErrMergeSelf`, an unknown target `ErrMergeTarget`, an unknown source `ErrNotFound`.
- `Delete`: links, rules on the key, then the Tag, in one transaction. Never refused because rules name the Tag.
- All three writes are all or nothing: the test makes every write to `variety_rules` fail and compares every touched table before and after (a control proves each operation works without the trigger).
- `Impact`: the Tag, its Recipe count (archived included), each Slot Rule by Meal Slot weekday, time, id, then Course position, with Meal Slot and Course names, and the Variety Rule (nil when none). Spans the Tag's own key only.
- `EnsureTx`: matches by `NameKey`, keeps the first spelling and the existing colour, creates with `NextColour` (so several new Tags in one transaction get different colours).

## Tests

| File | Covers |
|---|---|
| `internal/tag/tag_test.go` | `NameKey` (and equality with `course.NameKey`), `CleanName`, palette, `NextColour` table, `Merge` table |
| `internal/tag/store/store_test.go` | everything in the repository list above; rules are seeded by SQL so orphan keys can be tested |
| `internal/db/tags_migration_test.go` | 1440 on a seeded pre-1440 database, colours by name order and repeating after 10, name order not id order, fresh equals upgraded DDL, idempotent, and the schema guard (only `slot_rules.tag` and `variety_rules.tag`; green now, fails when a later migration adds another `tag` column) |
| `internal/recipe/store/store_tag_colour_test.go` | a Recipe saved or updated with a new Tag gets the next colour; an existing Tag is reused unchanged |

Existing recipe store tests stay unchanged and must keep passing.

## Not done here

`GET /api/tags` still comes from `internal/recipe/httpapi` (TG-API moves it). Events (`tags`, `recipes`, `plan.invalidate`) are TG-API's. The `tag_unknown` rule check is TG-R's and uses `Exists`.
