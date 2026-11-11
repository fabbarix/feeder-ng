# TG: Tags management (plan, migration and teams)

Design for "manage Tags (add, edit, rename) and set the colour of a Tag pill". Decisions: [ADR 0010](../../adr/0010-tags-as-entities.md). Spec: functional-spec §4.1 (new), §13, §14, §17 (new) and decision 32. Glossary: **Tag** (updated), **Tag colour** (new).

The short version: the `tags` rows that exist since 0300 gain a colour; any User manages them on Settings > Tags; Slot Rules and Variety Rules keep naming a Tag by its key, and the Tag repository rewrites them in the same transaction as every rename, merge and delete; a new Tag gets the colour fewest Tags have; the colour shows on every Tag pill. Recipe payloads, the plan payloads, the Recipe File and the Recipe Assistant do not change.

## 1. What is there today (e87d71d)

| Piece | Where | Today |
|---|---|---|
| Tag rows | `tags (id, key UNIQUE, name)`, `recipe_tags (recipe_id, tag_id, position)`, migration 0300 | Created on use by `upsertTag` (`internal/recipe/store/store.go:744`), first spelling kept, kept when unused. |
| Key | `recipe.TagKey` (`internal/recipe/recipe.go:411`) | Trimmed, whitespace collapsed, lower-cased. `course.NameKey` is the same rule. |
| Rules | `slot_rules.tag`, `variety_rules.tag` (PK), migrations 0600 and 1400 | The key as text, no foreign key. Handlers apply `recipe.TagKey` (`internal/plan/httpapi/handlers.go:289`, `:346`, `:358`). The planner matches keys (`internal/plan/plan.go:164`, `:212`, `:226`; `internal/plan/runner/snapshot.go:251`). |
| `GET /api/tags` | `internal/recipe/httpapi/httpapi.go:51`, `Store.Tags` | `[{ "name", "recipes" }]` by name; read by the recipes feature (`['tags']`) and the plan feature (`['plan','tags']`). |
| Web | `features/recipes/components/{TagChips,TagInput}.tsx`, `hooks/useKnownTags.ts`, `lib/tags.ts`, `lib/keys.ts`; `features/plan/{components/RulesEditors.tsx, hooks/useTagChoices.ts, lib/rules.ts, lib/phrase.ts}` | Neutral `Chip`s. Recipe tiles and detail show no Tags (the first Tag only picks the generated tile's glyph, `ui/lib/tagIcon.ts`). |
| Member colours | `features/settings/lib/memberForm.ts` | Eight hex swatches plus Custom (`ui/fields/ColorSwatches`), drawn as a ring and a start accent on a neutral surface. They are **not** OKLCH tokens; the Tag palette is a new, separate set of tokens (§3.3). |
| Storage Places page | `features/stock/screens/StoragePlacesScreen.tsx` | The pattern TG follows: `ListGroup` of `ListRow`s, a sheet to add and edit, Delete in the sheet behind `useConfirm().choose` (which also has `alternateLabel`). |

## 2. Migration 1440: `internal/db/migrations/1440_tags.sql`

Numbers: 1400 exists (A), 1410 is G1's (reminder keys), 1420 was withdrawn (task CD), 1430 is B-RX's (`plan_unfilled.exclusions_json`). TG takes **1440**. It depends on none of them: it reads `slot_rules` and `variety_rules`, whose shape 1400 set and nobody changes now. The runner applies every file not yet recorded, in name order, so 1440 may merge before 1410 or 1430 and a development database still ends up with all three.

```sql
-- TG (ADR 0010): a Tag carries a colour from the closed palette. Plain SQL: no rebuild, no foreign-key pragma.
ALTER TABLE tags ADD COLUMN colour TEXT NOT NULL DEFAULT 'tomato';

-- A Tag for every key a rule names that no Tag has (the spelling is unknown, so name = key).
INSERT INTO tags (key, name)
  SELECT k, k FROM (
    SELECT tag AS k FROM slot_rules WHERE tag IS NOT NULL AND tag <> ''
    UNION
    SELECT tag FROM variety_rules WHERE tag <> ''
  ) WHERE k NOT IN (SELECT key FROM tags);

-- Colours in name order: what each Tag would have got as the next colour had the Tags been added in that order.
UPDATE tags SET colour = (
  SELECT CASE (r.rn - 1) % 10
    WHEN 0 THEN 'tomato' WHEN 1 THEN 'apricot' WHEN 2 THEN 'mustard' WHEN 3 THEN 'olive' WHEN 4 THEN 'sage'
    WHEN 5 THEN 'teal' WHEN 6 THEN 'sky' WHEN 7 THEN 'blue' WHEN 8 THEN 'plum' ELSE 'rose' END
  FROM (SELECT id, row_number() OVER (ORDER BY lower(name), id) AS rn FROM tags) AS r
  WHERE r.id = tags.id);
```

- `recipe_tags` is not touched, so every Recipe keeps its Tags in its order and every Tag its Recipe count.
- No `CHECK` on `colour`: the palette is validated in Go (`tag.ValidColour`), so retuning it later needs no table rebuild; an unknown id renders neutral in the SPA.
- A rule with an empty key is left as it is: it matches no Recipe, as before, and gets no Tag. Only a Variety Rule can have one, through `PUT /api/variety-rules/%20` (the handler keys the path with `recipe.TagKey`, which gives `''`). A Slot Rule cannot: in `POST /api/slot-rules` a blank `tag` with a `recipeId` makes a Recipe rule, and with neither `AddSlotRule` refuses it (`ErrInvalid`, `internal/plan/store/store.go:581`). The `slot_rules` half of the `WHERE` is a guard, not a known case.
- No snapshot is needed: the file only adds a column and rows, and a failure rolls back with the runner's transaction.

## 3. Design of the parts

### 3.1 Go: `internal/tag` (pure) and `internal/tag/store`

`internal/tag/tag.go`, no SQL or HTTP, mirroring `internal/course/course.go`:

- `NameKey(name string) string` (the rule moves here; `recipe.TagKey` becomes `return tag.NameKey(name)`), `CleanName(name) (string, error)` (1 to 40 runes after collapsing; `ErrNameInvalid`).
- `Palette = []string{"tomato","apricot","mustard","olive","sage","teal","sky","blue","plum","rose"}`, `ValidColour(id) bool`, `NextColour(counts map[string]int) string` (fewest Tags, ties in palette order; ids outside the palette in `counts` are ignored).
- `Merge(src, into RuleSet) MergeOutcome`: from the source's and target's Slot Rules (Meal Slot and Course of each) and Variety Rule flags, which Slot Rules move, which go (a duplicate on the same Meal Slot and Course), and whether the source's Variety Rule moves or goes. The repository applies the outcome; the SPA's `mergeSummary` (§3.2) phrases the same rule from `GET /api/tags/{id}/impact`.
- Errors, one API code each: `ErrNotFound` (404), `ErrNameInvalid` (422 `tag_invalid`, field `name`), `ErrColourUnknown` (422 `colour_unknown`, field `colour`), `NameTakenError{Tag}` (409 `tag_name_taken`), `ErrMergeSelf` and `ErrMergeTarget` (422, field `into`).

`internal/tag/store/store.go`:

- `List(ctx)`, `Get(ctx, id)`, `Create(ctx, name, colour string)` (empty colour: `NextColour` over the current counts, in the same transaction), `Update(ctx, id, name *string, colour *string)`, `Impact(ctx, id)`, `Merge(ctx, id, into)`, `Delete(ctx, id)`.
- `EnsureTx(ctx, tx, name) (id int64, err error)`: the **one** place a Tag is created on use; `internal/recipe/store`'s `writeContent` calls it instead of `upsertTag`, so the Recipe editor, Import and the Recipe Assistant all give a new Tag the next colour.
- `Exists(ctx, key) (bool, error)`: for TG-R's rule check, which `internal/plan/httpapi` reaches through its own one-method `TagExists` dependency (§3.1a), so `internal/plan/store` never imports this package.
- Rename with a key change, one transaction: `UPDATE tags SET key, name`, then the rules on the old key go to the new key **as `tag.Merge` says**, from the rules already on the new key (read from `slot_rules` and `variety_rules` by key, not through a Tag). Usually there are none and every rule moves. But until TG-R merges, a rule can name a key no Tag has (an orphan), and a plain `UPDATE variety_rules SET tag = new` would hit the `variety_rules` primary key, and a plain Slot Rule update the `UNIQUE (meal_slot_id, course_id, recipe_id, tag)` of 1400. The same key: the name only, no rule touched.
- Merge reads the destination's rules the same way, by key, so rules that name the destination's key are handled alike whether or not a Tag row stood behind them before 1440.
- Rename, Merge and Delete return whether they moved or removed a rule (`RulesChanged bool` in their result), for the events (§3.1a).
- Merge, one transaction: `DELETE FROM recipe_tags WHERE tag_id = src AND recipe_id IN (SELECT recipe_id FROM recipe_tags WHERE tag_id = into)`; `UPDATE recipe_tags SET tag_id = into WHERE tag_id = src` (keeps the source's position); Slot Rules and the Variety Rule as `tag.Merge` says; `DELETE FROM tags WHERE id = src`.
- Delete, one transaction: `recipe_tags`, then `slot_rules` and `variety_rules` on the key, then the Tag.
- The repository writes `slot_rules` and `variety_rules` only by key, in those three cases; it does not import `internal/plan/store`.

### 3.1a Go: events and the rule check

- **Events** (`internal/tag/httpapi`, after commit, in this order): `tags` on every write; then, on rename, merge and delete, `recipes`; then, when the result says `RulesChanged`, `plan.Invalidate(bus, plan.ReasonRulesChanged)`, which publishes `plan.invalidate {"reason":"rules_changed"}`. The runner plans `rules_changed` with `clearAll`, exactly as `runner.ChangeRules` does for a rule edit (`internal/plan/runner/runner.go:222`), so unpinned Planned Meals placed by a moved or removed rule are cleared and replanned. Publishing `recipes` alone gives `ReasonRecipeChanged`, which keeps them. `plan.invalidate` goes last because `Runner.Invalidate` coalesces pending invalidations and keeps the **last** reason. Importing `internal/plan` (types and `Invalidate` only) from `internal/tag/httpapi` is allowed: `plan.Invalidate` is documented as safe to call from any module.
- **Rule check** (TG-R, `internal/plan/httpapi`): `api` gains `tagExists TagExists`, with `type TagExists func(ctx context.Context, key string) (bool, error)`, wired at `mount` from `tagstore.New(d.DB).Exists`. `addSlotRule` (when `rule.Tag != ""`) and `setVarietyRule` call it before `run.ChangeRules` and answer `422 validation_failed`, `field: tag`, `reason: tag_unknown` when it is false. `internal/plan/store` and `internal/plan/runner` do not change, so B's runner tests and the plan store tests, which add rules with no Tag row, keep passing. A Tag deleted between the check and the insert leaves an orphan key, as any rule can today; the next rename onto it is handled by the Merge outcome above.

### 3.2 Web: `web/src/lib/tags` (plain TypeScript, plus the one React hook file)

- `types.ts` (`Tag`, `TagImpact`, `TagColourId`), `api.ts` (the §17 routes), `useTags.ts` (react-query `['tags']`, the key the recipes feature already invalidates, plus SSE `tags`; `useTagLookup()` gives `(name or key) => Tag | undefined` by `tagKey`).
- **Rule caches.** A rename, merge or delete can move or remove rules, so `lib/tags` exports `invalidateTagCaches(client)`, which invalidates `['tags']`, `['slot-rules']`, `['variety-rules']` and `['plan','tags']` (the keys of `features/plan/hooks/useRules.ts` and `useTagChoices.ts`). The `tags` SSE handler in `useTags` calls it (so another device's edit shows too), and so do the Tags page's rename, merge and delete on success. An add or recolour may call it as well; it is cheap.
- `palette.ts`: the ten colours in order, each with its display name and its OKLCH triples for `bg`, `fg` and `dot` in light and dark (§3.3); `isTagColour`.
- `nextColour.ts` (mirrors `tag.NextColour`, so the Add sheet can preselect it), `keys.ts` (`tagKey`, the same rule as `tag.NameKey`), `summaries.ts` (`mergeSummary`, `deleteSummary`: structured facts the components phrase from their strings).

### 3.3 Web: tokens and primitives

Tokens, in `web/src/styles.css`, in the light block, the `prefers-color-scheme: dark` block and the `data-scheme='dark'` block, as `oklch()` values (hex given for reference; `palette.ts` holds the same numbers and a test checks they match):

| Colour | Light `bg` / `fg` / `dot` | Dark `bg` / `fg` / `dot` |
|---|---|---|
| Tomato (29) | `0.94 0.030` #ffe4e0 / `0.40 0.100` #742f26 / `0.58 0.150` #c35043 | `0.33 0.060` #502923 / `0.90 0.052` #ffd2ca / `0.78 0.128` #ff9687 |
| Apricot (60) | `0.94 0.036` #fee6d4 / `0.40 0.094` #6b3900 / `0.58 0.136` #b36300 | `0.33 0.060` #4c2d12 / `0.90 0.060` #fdd5b7 / `0.78 0.130` #f4a25c |
| Mustard (90) | `0.94 0.050` #f8eac6 / `0.40 0.080` #584503 / `0.58 0.118` #957602 | `0.33 0.060` #41340a / `0.90 0.060` #edddb1 / `0.78 0.130` #d8b349 |
| Olive (120) | `0.94 0.050` #e6f1cc / `0.40 0.094` #424e02 / `0.58 0.136` #718506 | `0.33 0.060` #313a13 / `0.90 0.060` #d8e5b8 / `0.78 0.130` #adc35e |
| Sage (150) | `0.94 0.050` #d5f5da / `0.40 0.100` #115629 / `0.58 0.150` #1b9247 | `0.33 0.060` #1c3e24 / `0.90 0.060` #c3eac9 / `0.78 0.130` #76cf8a |
| Teal (190) | `0.94 0.050` #c6f7f2 / `0.40 0.068` #035350 / `0.58 0.100` #018d87 | `0.33 0.056` #023e3c / `0.90 0.060` #b0ebe7 / `0.78 0.130` #21d1ca |
| Sky (230) | `0.94 0.034` #d5f0fe / `0.40 0.078` #044f69 / `0.58 0.114` #0886b0 | `0.33 0.060` #093b4e / `0.90 0.060` #b6e6ff / `0.78 0.130` #4bc6fa |
| Blue (265) | `0.94 0.028` #e2ebff / `0.40 0.100` #2d457d / `0.58 0.150` #4e75d2 | `0.33 0.060` #263454 / `0.90 0.048` #cfdeff / `0.78 0.110` #95b6fe |
| Plum (310) | `0.94 0.038` #f3e5ff / `0.40 0.100` #58366f / `0.58 0.150` #955dbc | `0.33 0.060` #3f2c4c / `0.90 0.060` #ead4fc / `0.78 0.130` #d19ff5 |
| Rose (350) | `0.94 0.034` #fee2ee / `0.40 0.100` #6e2e4f / `0.58 0.150` #b94f87 | `0.33 0.060` #4c283a / `0.90 0.060` #fecee4 / `0.78 0.130` #f594c3 |

Each cell is `L C` at the hue in brackets (chroma already reduced to fit sRGB). Computed contrast: `fg` on `bg` 7.5 to 8.1 in light and 9.0 to 9.1 in dark; `dot` on `bg` 3.4 to 3.9 in light and 5.9 to 6.3 in dark. Names are for people; ids are the lower-case names.

Primitives (shared; no screen copies their markup):

- **`Chip`** gains `tagColour?: string` (`data-tag-colour`). On `kind="tag"`: the tinted fill, `fg` text and a leading 8 px `dot` (decorative, `aria-hidden`). On `kind="filter"`: unselected is the usual neutral filter chip with the dot; selected is the tinted fill with the tick. An unknown id falls back to the neutral chip. Status chips are untouched.
- **`TagDot`** (`ui/TagColour/`): the dot alone, for list rows and select options.
- **`TagColourPicker`** (`ui/TagColour/`): ten 40 px swatches in a `radiogroup` (roving arrows via `useRovingRadios`, each `radio` named "Sage"), the chosen one ticked, and a live pill preview slot. No Custom swatch, no `<input type="color">`.
- **`TagSelect`** (`ui/Select/TagSelect.tsx`): the shared `Select` with a dot and the Recipe count on each option, type-ahead and search, as `CourseSelect`.

### 3.4 Screens

- **Settings > Tags** (`web/src/features/tags/`, a new feature folder discovered by `app/features.ts`): `index.ts` (route `/settings/tags`, width from `/settings/*`), `screens/TagsScreen.tsx` (composed from IH's shared `ListPage`: header, then the list; no own page root or gap), `components/TagSheet.tsx` (Name, `TagColourPicker`, preview, Save, Merge into…, Delete), `hooks/useTagsPage.ts` (state, calls `lib/tags`), `strings.ts`, `tags.css`. Copy and behaviour as spec §4.1; Delete and Merge confirms use `useConfirm().choose` (Delete's alternate is Merge instead). Rows: `ListRow` with the Tag pill as title and the counts as meta.
- **Recipes**: `TagChips` and `TagInput` pass `tagColour` from `useTagLookup`; `TagInput` suggestions get a `TagDot`; a typed Tag not yet known is a neutral pill with "New"; `RecipeTile` shows the first two Tags and "+N"; the Recipe detail gets a Tags row under the name (new small component `RecipeTags`), each pill a link to `/recipes?tag=<name>`. `useKnownTags` is replaced by `lib/tags`' `useTags`.
- **Planning rules**: the Tag `Select`s become `TagSelect`; rule rows show the Tag pill by its name (from the key); `useTagChoices` is replaced by `useTags`; `phrase.ts` phrases `variety_relaxed` with the Tag's name when known, else the key (why chips stay neutral).

## 4. Teams

Each task follows the CLAUDE.md pipeline (test author, developer, reviewer) in its own worktree and branch, and writes its checks to `<worktree>/build/check.log`.

### 4.1 Tasks, files and dependencies

| Task | Scope | Owns (files) | Depends on |
|---|---|---|---|
| **TG-A** Data and domain | Migration 1440, `internal/tag` rules, the Tag repository, Tags on use with the next colour | `internal/db/migrations/1440_tags.sql`, `internal/db/tags_migration_test.go` (new, granted in `internal/db/**`); `internal/tag/tag.go`, `tag_test.go`, `internal/tag/store/**` (new); `internal/recipe/recipe.go` (`TagKey` calls `tag.NameKey`) and `internal/recipe/store/store.go` with its tests (`writeContent` calls `EnsureTx`; `upsertTag` goes) | Test author and developer start **now** on the new files. The two `internal/recipe` edits wait until **C1 and E1** merge (C1 may add the `?course=` filters to the recipe repository; E1 imports through it). Merges after C1 and E1. |
| **TG-UI** Shared web | `lib/tags`, tokens, `Chip` Tag colour, `TagDot`, `TagColourPicker`, `TagSelect`, the Gallery | `web/src/lib/tags/**` (new); `web/src/ui/TagColour/**` (new); `web/src/ui/Select/TagSelect.tsx` and its test (new); `web/src/ui/Chip.tsx`, `Chip.css`, `Chip.test.tsx`; `web/src/ui/index.ts`, `web/src/ui/Gallery.tsx`, `web/src/ui/galleryData.ts`; `web/src/styles.css` (Tag tokens only) | Starts **now** against the §17 contract (mocked). `ui/index.ts` and the Gallery are D's during Courses, so it merges after **D2**. It also merges after **IH** (team/ih-list-spacing: `ui/index.ts`, `ui/Gallery.tsx`, new `ListPage`) and **XS** (team/xs-extra-sheet: `ui/Select/Select.tsx` becomes a top-layer popover, which `TagSelect` builds on; TG-UI rebases `TagSelect` and its test onto it). |
| **TG-API** Routes | `internal/tag/httpapi`, the module, moving `GET /api/tags`, BDD | `internal/tag/httpapi/**` (new); `internal/modules/tags.go` (new file; nothing else in `internal/modules`); `internal/recipe/httpapi/httpapi.go` (only: remove the `GET /api/tags` route, `tags` handler and `tagJSON`); `internal/recipe/store/store.go` (only: remove `Tags` and `TagCount` once unused); `bdd/features/tags/**`, `bdd/steps_tags_test.go` (new). The existing step "I list the Tags" in `bdd/steps_recipes_test.go` (C's) keeps working unchanged (same route, same `name` and `recipes`). | After **TG-A** and **C1**. C2 does not touch `internal/recipe/httpapi`. |
| **TG-S** Settings > Tags | The page, its sheet and confirms, the Settings index row, breadcrumbs, guards | `web/src/features/tags/**` (new); `web/src/features/settings/lib/settingsSections.ts` and its test, `web/src/features/settings/strings.ts` (the row's copy only); `web/src/app/{breadcrumbs,breadcrumbStrings}.ts` and their tests; `scripts/lib/page-layout-rules.mjs` (adds `['/settings/tags', 'narrow']` to `ROUTES`: the guard visits only `ROUTES`, `scripts/check-page-layout.mjs:271`, so a `fail_routes` entry alone checks nothing; `web/src/app/pageLayoutRules.test.ts` then proves it equals `pageWidthFor`, which gives `narrow` from `/settings/*`); `scripts/check-page-layout.modes` (`/settings/tags` in `fail_routes`); `scripts/check-ui.rules` (`web/src/features/tags` in every `fail_paths`). The screen composes IH's `ListPage`. | After **D2** (settings and app files), **IH** (`ListPage`), **PN** (team/pn-pantry-nav: `check-page-layout.modes`, `page-layout-rules.mjs`, the `app` breadcrumbs, `pageWidths` and `features` tests), **TG-UI** and **TG-API**. Merges **before G2** starts, since G2 is granted the same `app` files and the layout list; if it is late, the Project Manager serialises the two. |
| **TG-RW** Recipes web | Colour on `TagChips`, `TagInput` and suggestions, Tags on Recipe tiles and detail | `web/src/features/recipes/{components/TagChips*, components/TagInput*, components/RecipeTile*, components/RecipeTags* (new), screens/RecipeDetailScreen*, screens/RecipesScreen*, hooks/useKnownTags* (removed), hooks/useRecipes*, lib/tags*, lib/keys*, types.ts, api.ts, strings.ts, recipes.css}` | After **E2** (which follows PT), **IH** (it edits `RecipesScreen.tsx` and its test) and **TG-UI**. |
| **TG-R** Rules check | `422 tag_unknown` on new Slot Rules and Variety Rules | `internal/plan/httpapi/**` only (the `TagExists` dependency on `api`, wired at `mount` from `tagstore.New(d.DB).Exists`; the check in `addSlotRule` and `setVarietyRule`; the error code; handler tests with a stub `TagExists`), **not** `internal/plan/store` or `internal/plan/runner` (§3.1a); `bdd/features/planning/rules_tags.feature`, `bdd/steps_tg_rules_test.go` (new); any existing planning scenario that adds a rule for a Tag no Recipe has is changed to add the Tag first (granted at TG-R time) | After **C-RX** (owns `plan/httpapi`) and **TG-A** (`tagstore.Exists`); merges **before C3**, which edits `plan/httpapi` again. No longer waits on B-RX: it does not touch `plan/store`. |
| **TG-PW** Planning rules web | `TagSelect` in the rule editors, Tag pills in rule rows, the Tag name in `variety_relaxed` chips | `web/src/features/plan/{screens/PlanningRulesScreen*, components/RulesEditors*, hooks/useTagChoices* (removed), lib/rules*, lib/phrase*}` and their tests; **not** `plan/{index,types,api,strings}.ts` (G2's in wave 4): if it needs them it waits for G2 | After **F** and **TG-UI**; in parallel with G2. |
| **H** (release, existing) | CHANGELOG ("Settings > Tags: rename, merge, delete and colour your Tags; Tags now show on Recipe tiles and the Recipe detail"), upgrade note (1440 adds colours, no snapshot), `docs/design/ux-brief.md` Colour line (after PN, which edits the same file; exact text below), `docs/spec/recipe-file.md` row `tags` reworded without "labels" and saying a missing Tag gets the next colour (E1's file until then), last GLOSSARY and spec pass | as in crs-plan §2.1 | last |

**H's ux-brief sentence.** The Colour bullet says "accent-tinted everything", which the fixed Tag palette contradicts. H replaces the whole bullet with exactly:

> - **Colour:** accent-tinted surfaces and controls (Material You style). Each User's accent generates tonal light and dark palettes, and every surface takes a tint from it. Contrast is checked against WCAG AA. Two sets of colours are fixed and not derived from the accent: the status colours (spoiling soon, leftover), which are reserved, and the ten Tag colours, a closed palette in light and dark that tells Tags apart on their pills and means nothing else (spec §4.1, §14).

No task edits `internal/planner/**`, `internal/plan/{plan,types}.go`, `internal/recipefile/**`, `internal/recipeassistant/**`, `docs/spec/recipe-file*`, `web/src/features/import/**`, `web/src/features/settings/**` beyond the two files named, or any Courses file not named above.

### 4.2 Waves, fitted around Courses

```
Courses wave 2 (now):  C1 · E1 · G1 · D2 · PT · B merges
TG now:                TG-A (new files)   TG-UI (new files)
Courses wave 3:        C2 · F · E2 (after PT) · B-RX
TG wave 3:             TG-A merges (after C1, E1) → TG-API (after TG-A, C1)
                       TG-UI merges (after D2, IH, XS) → TG-S (after D2, IH, PN, TG-UI, TG-API; before G2)
Courses wave 4:        C-RX → G2 · C3 (after F, G2)
TG wave 4:             TG-RW (after E2, IH, TG-UI)   TG-PW (after F, TG-UI; beside G2)   TG-R (after C-RX, TG-A; before C3)
Wave 5:                H (with the TG lines)
```

- **Can start now:** TG-A and TG-UI, on new files only; neither waits on a design answer. TG-A's test author can write the migration and repository tests at once.
- **In parallel, no shared files:** TG-A with every Courses team (it owns new files until C1 and E1 merge); TG-UI with D2 (it merges after); TG-API with C2 and F; TG-RW, TG-PW and TG-R with each other and with G2 (G2 owns `plan/{index,types,api,strings}.ts`, `CouldntPlan*` and `couldnt*`; TG-PW owns other plan files).
- **Serialised:** TG-API after TG-A (it calls the repository) and C1 (`internal/recipe/httpapi`); TG-UI after IH (`ui/index.ts`, `ui/Gallery.tsx`) and XS (`ui/Select/Select.tsx`); TG-S after IH (`ListPage`) and PN (`check-page-layout.modes`, `page-layout-rules.mjs`, `app` breadcrumbs, `pageWidths` and `features` tests), and before G2 (`app/breadcrumbs*`, `check-page-layout.modes`); TG-R between C-RX and C3 (`plan/httpapi`); TG-RW after E2 and IH (`features/recipes/**`, `RecipesScreen.tsx`); TG-PW after F (`features/plan/**`).
- **main stays green at every merge.** Until TG-API merges, `GET /api/tags` is still the recipes route and the SPA ignores `colour`; until TG-RW and TG-PW merge, pills are neutral (an unknown or missing colour renders neutral by design). Until TG-R merges, a rule can still name an unknown key through the API, as today; the UI only offers existing Tags.
- If E2 or F slips, TG-RW or TG-PW waits; nothing else in TG depends on them.

### 4.3 What each task tests first

- **TG-A**:
  - *Migration* (`internal/db/tags_migration_test.go`): seed at `upTo(t, "1440_")` Tags "Fish" (2 Recipes, one archived), "pasta" (1), "Roast" (none), a Slot Rule on key `pizza` and a Variety Rule on `soup` with no Tag, a Variety Rule on `fish`, and a Slot Rule with key `''`. After `MigrateEmbedded`: every Tag keeps its id, key and name; `recipe_tags` is the same set of rows (counts unchanged); `pizza` and `soup` exist with name = key; colours in name order are fish tomato, pasta apricot, pizza mustard, roast olive, soup sage; no Tag has key `''`; with 12 seeded Tags the 11th by name is tomato and the 12th apricot; a fresh database has the same `sqlite_master` text for `tags` as an upgraded one; a second `MigrateEmbedded` is a no-op. *Schema guard*: `SELECT m.name, p.name FROM sqlite_master AS m, pragma_table_info(m.name) AS p WHERE m.type = 'table' AND p.name = 'tag'` returns exactly `slot_rules.tag` and `variety_rules.tag` on a fresh database, so a later migration that adds another `tag` column (a key the Tag repository would not rewrite) fails the build until the repository and this test are updated.
  - *Rules* (`internal/tag/tag_test.go`, pure): `NameKey` ("  Fish   Pie " is `fish pie`; "Purée" and "Puree" differ; same results as `course.NameKey` on a shared table); `CleanName` (0 and 41 runes refused, 40 accepted, inner spaces collapsed, case kept); `ValidColour`; `NextColour` table (none: tomato; tomato 1: apricot; all ten at 1: tomato; all at 2 but rose at 1: rose; an unknown id in the counts ignored); `Merge` table (rules move; a duplicate on the same Meal Slot and Course goes, one on another Course moves; target has a Variety Rule: the source's goes; target has none: it moves; neither: nothing); merging into itself refused.
  - *Repository* (`internal/tag/store/store_test.go`): `List` order and counts (archived Recipes counted, `slotRules`, `varietyRule`); `Create` with and without colour; a taken key gives `NameTakenError` naming that Tag; an unknown colour is refused; a respell keeps the key and touches no rule; a rename with a new key rewrites exactly the Slot Rules and the Variety Rule on the old key and no other Tag's; a rename onto another Tag's key changes nothing and names that Tag; *orphan keys*: with a Variety Rule and a Slot Rule (Friday Dinner · Main) seeded by SQL on key `pizza` that no Tag has, and fish carrying a Variety Rule and the same Slot Rule plus one on Saturday Dinner, renaming fish to "Pizza" succeeds (no primary-key or `UNIQUE` error), keeps `pizza`'s Variety Rule and drops fish's, drops fish's Friday Slot Rule as a duplicate and moves the Saturday one, exactly as the `Merge` table; Rename, Merge and Delete report `RulesChanged` true when a rule moved or went and false otherwise (a respell, a Tag with no rules); recolour alone; `Merge` (a Recipe with both keeps one link in the target's position, a Recipe with the source only gets the target in the source's position, rules as the `Merge` table, the source is gone, the target's name and colour unchanged); `Delete` (links, rules and the Tag gone; other Tags untouched); a failure part-way (a test trigger that raises on the last statement) leaves nothing changed for rename, merge and delete; `Impact` names each Slot Rule with its Meal Slot and Course; `EnsureTx` returns an existing Tag for another spelling and creates a new one with the next colour.
  - *Recipe repository*: saving a Recipe with a new Tag creates it with the next colour; "FISH" on a Recipe links the existing "Fish" and keeps its name; existing recipe store tests pass unchanged.
- **TG-UI**: every palette colour's `fg` on `bg` is at least 7:1 and `dot` on `bg` at least 3:1, light and dark, computed from `palette.ts` with `theme/color.ts`; `dot` also at least 3:1 on the default `--color-surface` of each scheme (the unselected filter chip draws the dot on a neutral chip); `invalidateTagCaches` invalidates exactly `['tags']`, `['slot-rules']`, `['variety-rules']` and `['plan','tags']`, and a `tags` SSE event in `useTags` triggers it; `styles.css` holds exactly the `palette.ts` values in all three scheme blocks (a CSS test as `styles.pageTokens.css.test.ts`); no Tag token equals a status token; `nextColour` passes the same table as `tag.NextColour`; `tagKey` the same table as `tag.NameKey`; `mergeSummary` and `deleteSummary` tables (with and without rules, a target with and without a Variety Rule, Recipes with both); `Chip` with `tagColour` (attribute, `aria-hidden` dot, unknown id neutral, filter selected and unselected, status chips unchanged); `TagColourPicker` (radiogroup, arrow keys move and select, Home and End, each swatch named, checked state, no native control: the `native-controls` test passes); `TagSelect` (listbox roles, dots, counts, type-ahead, search); the Gallery shows each.
- **TG-API**: BDD `bdd/features/tags/tags.feature`, as a User who is not an Admin: list (new fields, old fields kept), add with and without colour, the taken name, the bad name and colour, respell, rename with rules following (`GET /api/slot-rules` and `GET /api/variety-rules` show the new key), rename onto another Tag (`409` naming it), recolour, impact, merge (every outcome of the `Merge` table through the API), merge into itself (`422`), delete with rules gone, `404`s. Handler tests: the events, in order (add and recolour publish `tags` only; a respell, or a rename, merge or delete that touches no rule, publishes `tags` then `recipes`; a rename, merge or delete that moves or removes a rule publishes `tags`, `recipes`, then `plan.invalidate` with `{"reason":"rules_changed"}`, last); with the runner wired, deleting fish when a Slot Rule Friday Dinner · Main = fish placed an unpinned fish Recipe clears that meal and replans it without the rule (a `recipes`-only replan would keep it), and a pinned meal stays; a Variety Rule at most 1 fish a week still holds after renaming fish to Seafood (the replan plans at most one Seafood Recipe that week).
- **TG-S**: the list (pill, each meta form, "No Recipes yet", empty state with Add Tag); Add preselects the next colour and saves; a taken name shows the field error; rename to a new spelling saves; rename onto another Tag opens the merge confirm with the summary and merges on confirm, and Cancel keeps the sheet open with the typed name; Merge into… (select, confirm); Delete with and without rules, and Merge instead from it; rename, merge and delete invalidate `['slot-rules']`, `['variety-rules']` and `['plan','tags']` as well as `['tags']`; a failed write shows a Toast and keeps the sheet; the Settings index row and the breadcrumb; the page-layout guard: `/settings/tags` in `ROUTES` as `narrow` (the contract test with `pageWidths.ts` passes) and in `fail_routes`; keyboard and screen reader (sheet labelled, picker a radiogroup, dialog titles).
- **TG-RW**: `TagChips` pills carry each Tag's colour, selected and unselected; `TagInput` chips and suggestions carry it, a new Tag is neutral with "New" and coloured once saved and listed; a Recipe tile shows two Tags and "+N", none when the Recipe has none; the Recipe detail shows every Tag and each opens the filtered list; a Recipe whose Tag spelling differs from the Tag's name still finds its colour (by key); existing snapshots updated only where Tags now show.
- **TG-R**: `POST /api/slot-rules` with an unknown Tag is `422 tag_unknown`, with another spelling of an existing Tag `201` with its key; `PUT /api/variety-rules/{tag}` likewise; a Recipe Slot Rule (`recipeId`, no `tag`) does not call `TagExists`; handler tests use a stub `TagExists`; `internal/plan/store` and `internal/plan/runner` tests are unchanged and pass; every existing planning scenario still passes.
- **TG-PW**: the Tag selects list Tags with dots; rule rows show the Tag pill by name, not the key; a `variety_relaxed` chip reads "3rd Fish this week" with the Tag's name, and the key when the Tag is gone; existing rule editor tests pass.

## 5. Open questions for the user (with the default the teams build if nobody answers)

1. **The generated Recipe tile's colour.** A Recipe without a photo is drawn as a tile with its first Tag's glyph on the accent tone (ux-brief). It could take its first Tag's colour instead, so Recipes group visually on the Recipes list. *Default:* no; the tile keeps the accent tone and the colour shows on the Tag pills only.
2. **The Agent Prompt and the Recipe Assistant know the Household's Tags.** Today the AI invents Tags ("traybake", "one pan"), and each new one becomes a Tag with the next colour. Listing the existing Tags in the prompt (as `{{COURSES}}` does for Courses) would let it pick from them. *Default:* not in TG, so the Recipe File and Recipe Assistant contract stay as they are; a small follow-up after E1 can add it.
3. **The order of Tags.** Tags are listed by name everywhere (the filter, the page, the pickers). *Default:* by name; no drag order. The alternative is a household order set on the Tags page, as for Courses.
4. **More than ten Tags.** Colours repeat from the eleventh Tag (the least used colour comes next). *Default:* ten colours, repeats allowed. The alternative is a larger palette, which leaves neighbouring hues harder to tell apart on a small pill.
