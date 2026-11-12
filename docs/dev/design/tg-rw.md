# TG-RW: Tag colours in the Recipes web screens

Design note for TG-RW ([tg-plan.md](tg-plan.md) §4, spec §4.1 and §14, [ADR 0010](../../adr/0010-tags-as-entities.md)). Test-first: the tests below are red until the Developer fills the stubs. Built on TG-UI ([tg-ui.md](tg-ui.md): `Chip tagColour`, `TagDot`, `useTags`, `useTagLookup`).

## 1. Decisions

- **Tiles without a photo keep the accent colour** (user decision): `RecipeThumb` takes no Tag colour. The colour shows on the Tag chips only.
- **Tags are ordered by name** (user decision) wherever they are listed from `useTags` (the filter, the suggestions). A Recipe's own Tags keep the Recipe's order on its tile and detail.
- **Colours repeat after 10** (user decision, decided in TG-UI/TG-A); nothing to do here.
- Colour comes from `useTagLookup` **by key** (`tagKey`), so a Recipe that spells a Tag "Roast" still finds the Tag "roast". A Tag with no known colour (not saved yet, not loaded yet, an id this SPA does not know) is a **neutral chip**: `Chip` already ignores an unknown id.
- Components stay presentational: they take `colourOf?: (name) => string | undefined` as a prop (no query client in their tests); screens get it from the hook. Without `colourOf` every chip is neutral, so the existing component tests keep passing.
- Live updates: `useTags` already refreshes the `['tags']` cache on the `tags` SSE event and on reconnect, so a recolour or rename in Settings > Tags shows on an open Recipes screen. `useRecipeLiveUpdates` keeps invalidating `['tags']` for `recipes` events.

## 2. Hook: `hooks/useRecipeTags.ts` (replaces `useKnownTags`, which is deleted)

`useRecipeTags(): { known: TagCount[], colourOf(name) }`. `known` = `useTags().tags` mapped to `{name, recipes}` (by name); `colourOf` = `useTagLookup()(name)?.colour`. `useKnownTags` and its direct `recipesApi.tags` query for the editor go away; `recipesApi.tags` stays for `useRecipes`' filter row. `RecipeEditorScreen` calls `useRecipeTags()` once and passes `known` as `knownTags` and `colourOf` down through `RecipeDetailsFields` to `TagInput`.

## 3. Components

| Piece | Contract |
|---|---|
| `lib/tags.ts` | `visibleTags(tags, limit) => {shown, more}` (Recipe order, `more` = the rest); `recipesTagPath(name)` = `/recipes?tag=` + `encodeURIComponent(name)`. |
| `RecipeTags` (new) | `{tags, colourOf?, limit?, onOpen?}`: a `<ul aria-label="Tags">` (class `recipe-tags`) of `Chip kind="tag"` with `tagColour`; with `limit`, the first `limit` then a neutral non-interactive `+N` chip; with `onOpen`, each chip is a button named after the Tag. Nothing for no Tags. Same shape as `CourseChips`. |
| `RecipeTile` | `colourOf?`; renders `<RecipeTags limit={2}>` after the Course chips (no `onOpen`: the tile stays one button). Ready Meal and Archived stay neutral tag chips. |
| `RecipeDetailScreen` | In the hero tile, `<RecipeTags tags={r.tags} colourOf onOpen={(n) => navigate(recipesTagPath(n))}>`: every Tag, each opens the filtered list. |
| `TagChips` | `colourOf?`; each Tag filter chip gets `tagColour`: unselected shows the dot, selected is tinted (the `Chip` filter rule). "All Tags" is never coloured. |
| `TagInput` | `colourOf?`; each chip gets `tagColour`; when `colourOf` is given and the Tag has no colour, the chip is neutral and carries `<span class="tag-input__new">New</span>` after the name (its accessible name stays "Remove Tag X"; no `colourOf` means no "New"). Each suggestion starts with a `TagDot` for its colour. Once the Recipe is saved and the Tags list refetches the chip is coloured. |
| `RecipesScreen` | `useRecipeTags()` for `colourOf` into `TagChips` and every `RecipeTile`; the Tag filter starts from `useSearchParams().get('tag')` (so the detail's Tag chips can link to it). |

## 4. Files (TG-RW grant, tg-plan §4.2)

New: `components/RecipeTags.tsx`, `hooks/useRecipeTags.ts`. Changed: `components/{TagChips,TagInput,RecipeTile,RecipeDetailsFields}.tsx`, `screens/{RecipesScreen,RecipeDetailScreen,RecipeEditorScreen}.tsx`, `lib/tags.ts`, `recipes.css`. Removed: `hooks/useKnownTags.ts`. `RecipeDetailsFields` is outside the plan's grant list but is the only path from the editor to `TagInput`; the Project Manager should confirm no other team holds it.

## 5. Not here

Settings > Tags (TG-S), the rule editors (TG-PW), the Plan screens, Go, GLOSSARY, CHANGELOG, spec.

## 6. CSS

`.recipe-tags`: wrapping flex row, token gap, no list style (like `.course-chips`). `.tag-input__new`: small muted text after the name. `.tag-input__suggestion .tag-dot` sits before the name. No colour literals; colours come from `Chip` and `TagDot`.

## 7. Tests (all in the commit)

| File | Pins |
|---|---|
| `lib/tags.rw.test.ts` | `visibleTags`, `recipesTagPath`. |
| `components/RecipeTags.test.tsx` | list, colours, dots, by-spelling lookup, `+N`, buttons with `onOpen`. |
| `components/TagChips.colour.test.tsx` | selected and unselected, unknown, All Tags, no `colourOf`. |
| `components/TagInput.colour.test.tsx` | chip colour, New, suggestion dots, names and picking unchanged. |
| `components/RecipeTile.tags.test.tsx` | two Tags then `+N`, none, one button, thumb untouched. |
| `hooks/useRecipeTags.test.tsx` | by-name `known`, by-key `colourOf`, refresh on cache invalidation. |
| `screens/Recipes|RecipeDetail|RecipeEditor` `.tags.test.tsx` | wiring: filter, tiles, `?tag=`, detail links, editor field. |
| `recipes.tags.css.test.ts` | CSS contract above. |

Existing tests that count lists or buttons on a tile or the detail may need updating where Tags now show (a Tags list appears for Recipes with Tags).
