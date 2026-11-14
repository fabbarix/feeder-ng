# beta.8 team recipes: the Recipe card spill and several Tags

Team `recipes`, branch `team/b8-recipes`. Domain words from [GLOSSARY.md](../../../GLOSSARY.md); rules from
[system.md](../../design/system.md); the filter header is [recipes-filter.md](../../design/recipes-filter.md) (§16 is new).

## 1. The Recipe card spill at 1180 px

**Found.** `PAGE_LAYOUT=full PAGE_LAYOUT_ONLY='^/recipes$' scripts/check-page-layout.sh` (the guard limited to the Recipes list)
reproduces it in about 40 s: at 1180 px, `P11 article.tile: clipped`, `P13 li spills 3 px past its article.tile`, `P13 span.chip
spills 3 px`.

**Cause.** The card is a `BentoGrid` track (`minmax(min(20rem,100%),1fr)`), `.recipe-tile { min-inline-size: 0 }`. Inside, the Tag
and Course chip rows (`.recipe-tags`, `.course-chips`) are `display: flex; flex-wrap: wrap`, and their items are `<li>`. A flex
item is `min-inline-size: auto`, so an `<li>` holding a long Tag name kept its natural width; `.chip` has `max-inline-size: 100%`,
but that resolves against the `<li>`, which has no bound, so the chip's ellipsis never engaged. At 1180 px the track is the narrowest
the card ever gets before the grid drops a column, so the seeded long Tag overran the card's padding by 3 px (the wider
widths have a wider track, the narrower ones wrap sooner).

**Fix (system.md: chips are one line and truncate, 6; no new token).** In `recipes.css`: `.recipe-tags > li, .course-chips > li {
min-inline-size: 0; max-inline-size: 100% }`. The Chip's own ellipsis cuts the name; its full text is already in the chip's title.
**Already applied and committed** (de16cbf3) because it was proven by the guard (OK, 32 probes). The developer keeps it.

**Test.** `web/src/features/recipes/recipes.card.css.test.ts` pins both rules (jsdom cannot lay out). The proof of the layout is the
guard itself: the seed already has the long Tag; the reviewer re-runs the command above and a full `PAGE_LAYOUT=full` run.

## 2. Server: several Tags (AND)

### 2.1 Domain (`internal/recipe`)
`func TagKeys(names []string) []string`: the keys (`TagKey`) of the names, in order, blanks dropped, a repeated key dropped (the
first stays), never nil (`[]string{}` for none). Pure; tested directly (`internal/recipe/tagkeys_test.go`).

### 2.2 Store (`internal/recipe/store`)
`ListFilter.Tag string` becomes `Tags []string` (names or keys; the store calls `recipe.TagKeys`). For each key one
`EXISTS (SELECT 1 FROM recipe_tags rt JOIN tags t ON t.id = rt.tag_id WHERE rt.recipe_id = r.id AND t.key = ?)` is ANDed into the
WHERE, so a Recipe needs every Tag. No keys = no Tag filter. The other filters (Archived, Kind, Query, Course) are unchanged and combine.
The existing `Tag:` cases in `store_test.go` are renamed to `Tags: []string{...}`; no other caller used `Tag`.

### 2.3 Handler (`internal/recipe/httpapi`)
Thin: `f := store.ListFilter{..., Tags: q["tag"], ...}`. A single `?tag=x` is `["x"]`. No new error: a blank or unknown Tag is not a
refusal (an unknown Tag matches no Recipe, as before).

## 3. Client: several Tags

URL: `?tag=a&tag=b`, order chosen, the other parameters kept. Every change still replaces the history entry.

### 3.1 `lib/recipeFilters.ts` (plain TypeScript)
```ts
export interface RecipeFilterState { kind: 'plannable' | 'base'; course: number | null; tags: string[] }
// tags: every ?tag=, trimmed, blanks dropped, a repeat by tagKey dropped (first spelling stays), URL order
export function withTags(params: URLSearchParams, names: readonly string[]): URLSearchParams   // replaces all; same cleaning
export function toggleTag(params: URLSearchParams, name: string): URLSearchParams  // appends, or removes the one matching by key; blank = no change
// withTag is removed. withoutFilters deletes course and every tag.
export type ActiveFilterChipKey = 'course' | `tag:${string}`          // `tag:` + tagKey(name)
export type ActiveFilterChip = FilterChip<ActiveFilterChipKey>
// activeFilterChips: Course (Recipes only) then one chip per Tag in URL order, label = known spelling else the URL's,
// key `tag:<tagKey>`, removeLabel "Remove Tag: <label>", tagColour when it has one
export function tagFilterRows(known, selected: readonly string[], query, colourOf?): TagFilterRow[]
// selected Tags (by key, even unknown ones) first, in the order given, those not matching the query dropped; then the others by name
```
`filtersButtonLabel(count)` is unchanged; `count` is the number of chips.

### 3.2 `hooks/useRecipeFilters.ts`
`tag`/`setTag` become `tags: string[]` and `toggleTag(name)`; `remove(key: ActiveFilterChipKey)` (`'course'` or `'tag:<key>'` removes
just that one); `clear()` drops the Course and every Tag; `count = chips.length`.
`useTagFilterSearch(known, selected: readonly string[], colourOf?)`.

### 3.3 Components
- `TagFilterList`: props `selected: string[]`, `onToggle(name)` (was `selected: string`, `onSelect`); the `OptionList` gets `multiple`
  (`aria-multiselectable`). Choosing never closes the panel.
- `RecipeFiltersPanel`: props `tags: string[]`, `onToggleTag(name)` (were `tag`, `onTag`).
- `RecipesScreen`: `tags: filters.tags.length ? filters.tags : undefined` in the `RecipeFilter`; `ActiveFilterChips` `onRemove={filters.remove}`.
  `ActiveFilterChips` (shared) needs no change: it is generic in the key.
- `RecipeFilter.tag?: string` becomes `tags?: string[]`; `listQuery` appends one `tag` per Tag in order (none for `[]`/absent);
  `useRecipes` counts `tags?.length` in `filtered`.
- `lib/tags.ts` `recipesByTagPath(name)` (`/recipes?tag=<name>`) is unchanged.

### 3.4 Copy
No new string. "Remove Tag: fish" (`removeTag`), "Filters, 3 active" (`buttonLabel`), "Search Tags", "Filter by Tag" are reused. The word is
"Tag" everywhere; no `_Avoid_` word.

## 4. Tests (all written; red until the developer is done)

| Layer | File |
|---|---|
| Go domain | `internal/recipe/tagkeys_test.go` |
| Go store | `internal/recipe/store/store_tags_test.go`, and the `Tag:` to `Tags:` rename in `store_test.go` |
| Go handler | `internal/recipe/httpapi/tags_filter_test.go` |
| BDD | `bdd/features/recipes/recipes_filter_tags.feature` (steps exist: "I list the Recipes with the filter") |
| Web lib | `lib/recipeFilters.test.ts` (updated + b8 cases) |
| Web hooks | `hooks/useRecipeFilters.test.tsx`, `hooks/useTagFilterSearch.test.tsx`, `hooks/useRecipes.tags.test.tsx` |
| Web api | `api.tags.test.ts` (+ `api.sort.test.ts`, `api.courses.test.ts` use `tags`) |
| Web components | `components/TagFilterList.multi.test.tsx`, `TagFilterList.test.tsx`, `RecipeFiltersPanel.test.tsx` |
| Web screens + a11y | `screens/RecipesScreen.filters.tags.test.tsx`, `RecipesScreen.filters.a11y.test.tsx`, and `lastFilter().tags` in the other `RecipesScreen.*.test.tsx` |
| CSS | `recipes.card.css.test.ts` (item 1; already green) |

All paths under `web/src/features/recipes/`. Tests I changed that existed before: only the renames to the new API (`tag` to `tags`, `selected` to a
list, `onSelect` to `onToggle`, `onTag` to `onToggleTag`, `setTag` to `toggleTag`, chip key `'tag'` to `'tag:<key>'`); no expectation was loosened.
