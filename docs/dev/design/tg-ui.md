# TG-UI: Tag colours, TagDot, TagColourPicker, TagSelect

Design note for the shared web part of TG ([tg-plan.md](tg-plan.md) §3.2, §3.3, §4.3; spec §4.1, §14, §17; [ADR 0010](../../adr/0010-tags-as-entities.md)). Test-first: the tests below are red until the Developer fills the stubs.

## 1. Decisions

- **Tags are ordered by name** (user decision). `useTags` and `tagOptions` both sort with `sortTagsByName` (case and accents ignored, ties by id), whatever order the server answers in.
- **Colours repeat after 10** (user decision): `nextColour` returns the colour the fewest Tags have, ties to the first in palette order, so the 11th Tag is tomato again. Same table as Go `tag.NextColour`.
- No native UI: the picker is ten `<button role="radio">` swatches, never `<input type="color">`; the select is the shared `Select`; icons are Phosphor through `Icon` (the picker's tick is `Icon name="tick"`).
- The Tag colour id is a plain `string` on `Tag` and on `Chip`/`TagDot` props, so a colour an older SPA does not know renders neutral instead of breaking.

## 2. `web/src/lib/tags` (plain TypeScript, plus the one hook file)

| File | Contract |
|---|---|
| `types.ts` | `Tag {id, name, key, colour, recipes, slotRules, varietyRule}`, `TagColourId`, `TagImpact {recipes, slotRules: ImpactSlotRule[], varietyRule: ImpactVarietyRule \| null}`, `TagInput`, `TagPatch`. |
| `palette.ts` | `TAG_COLOURS` (ten ids in order), `TAG_PALETTE` (`{id, name, light, dark}`, each scheme `{bg, fg, dot}` as `Oklch {l, c, h}` from `theme/color`), `isTagColour`, `tagColourName(id)` ("Sage" / `undefined`), `tagToken(id, part)` (`--tag-sage-bg`). Numbers are those of tg-plan §3.3; `palette.fixture.ts` holds the reference table the tests compare with. |
| `keys.ts` | `tagKey(name)`: trim, collapse whitespace, lower-case; accents count. Same table as `tag.NameKey` and `courseNameKey`. |
| `nextColour.ts` | `nextColour(counts)`; `colourCounts(tags)`. |
| `order.ts` | `sortTagsByName`. |
| `summaries.ts` | `mergeSummary({source, target, sourceImpact, targetImpact, bothRecipes?})` gives `{source, target, recipes, bothRecipes, movedRules, droppedRules, varietyRule: 'moves'\|'goes'\|'none'}`; `deleteSummary({tag, impact})` gives `{name, recipes, rules, varietyRule, hasRules}`. A source Slot Rule is dropped when the target has a rule on the same `mealSlotId` and Course (a missing and a `null` `courseId` are the same Course), else it moves; the source Variety Rule goes when the target has its own, moves when not. No copy here: TG-S phrases them. |
| `api.ts` | `tagsApi.list/create/update/impact/merge/remove` on the §17 routes through `lib/http`. |
| `useTags.ts` | `useTags()` (query `['tags']`, ordered by name, SSE topic `tags`), `useTagLookup()` (by `tagKey`), `invalidateTagCaches(client)` and `TAG_CACHE_KEYS`: exactly `['tags']`, `['slot-rules']`, `['variety-rules']`, `['plan','tags']`. The `tags` event and an SSE reconnect call it; the hook does nothing about events where `EventSource` is undefined, and unsubscribes and `close()`s on unmount. |

**Open point for the Project Manager.** `GET /api/tags/{id}/impact` has no "Recipes that already have both Tags" count, yet the merge confirm of §4.1 says "(4 already have both)". `mergeSummary` takes `bothRecipes` as optional (0 when unknown, and then the confirm leaves the clause out). If the clause is wanted, TG-API must add the number (for example `?into=<id>` on the impact route) before TG-S relies on it.

## 3. Tokens (`web/src/styles.css`)

Thirty custom properties `--tag-<id>-bg|fg|dot` as `oklch(L C H)` in each of the three scheme blocks: `:root, [data-scheme='light']`, the `prefers-color-scheme: dark` block's `:root:not([data-scheme='light'])`, and `:root[data-scheme='dark'], [data-scheme='dark']`. `styles.tagTokens.css.test.ts` compares them with the reference table, with `palette.ts`, and checks that none equals a `--status-*` colour in sRGB.

## 4. Primitives

- **`Chip`** gets `tagColour?: string`. On `kind="tag"` (the default): `data-tag-colour`, the tinted fill and `fg` text, and a leading `<span class="chip__dot" aria-hidden>` (8 px). On `kind="filter"`: `data-tag-colour` always; unselected is the neutral filter chip **with** the dot; selected is tinted with the tick and **no** dot. An unknown id: neutral chip, no attribute, no dot. `status`, `state`, `why` and `count` ignore it. CSS: `.chip[data-kind='tag'][data-tag-colour='<id>']`, `.chip[data-kind='filter'][data-tag-colour='<id>'][aria-pressed='true']` and `.chip[data-tag-colour='<id>'] .chip__dot`, per id, and no rule that tints an unselected filter chip.
- **`TagDot`** (`ui/TagColour/TagDot.tsx`): `<span class="tag-dot" aria-hidden="true" data-tag-colour={id}>`; unknown or missing id: the neutral dot (`--color-outline` or similar), no attribute.
- **`TagColourPicker`** (`ui/TagColour/TagColourPicker.tsx`): props `label`, `value`, `onChange(id: TagColourId)`, `disabled`, `helper`, `error`, `preview?: ReactNode`. A `FieldFrame` with a `radiogroup` named by the label; ten 40 px `button role="radio"` `.tag-swatch` with `aria-label` = display name, `aria-checked`, `data-tag-colour`, the checked one holding a decorative tick; roving tabindex through `useRovingRadios` (arrows select and move focus and wrap, Home and End); an unknown value checks nothing and the first swatch is the tab stop; `preview` is drawn under the group, outside it. No Custom swatch.
- **`TagSelect`** (`ui/Select/TagSelect.tsx`): `tags: TagChoice[]` (`{id, name, colour, recipes?}`), `value: number \| null`, `onChange(id)`, `exclude?: number`, plus the `SelectFieldProps`. Built on `Select` (`entityName="Tag"`). `tagOptions(tags, exclude?)`: by name, `leading` a `TagDot`, `meta` "12 Recipes" / "1 Recipe" / "No Recipes yet" (none when `recipes` is undefined; copy in `ui/TagColour/strings.ts`). Search appears above 8 options, as the other domain selects.
- `ui/index.ts` exports `TagDot`, `TagColourPicker`, `TagSelect`, `tagOptions` and their types (additive lines at the end; TG-UI merges after D2).
- **Gallery** (additive, after `CourseSelectGroup`): groups "Tag chips" (a tag chip and a dot-only row for each of the ten colours, plus a filter chip unselected and selected), "TagDot", "TagColourPicker" (label "Tag colour", with a preview chip) and "TagSelect" (label "Tag").

## 5. Tests (all in the commit)

| Test file | What it pins |
|---|---|
| `lib/tags/palette.test.ts` | The reference table meets 7:1 (fg/bg) and 3:1 (dot/bg, dot/surface) in both schemes (green: guards the spec numbers); `palette.ts` equals the table; the same contrast is computed from `palette.ts` with `theme/color`, dot against the default `--color-surface` read from `styles.css`. |
| `styles.tagTokens.css.test.ts` | Thirty tokens in each of three blocks equal the table and `palette.ts`; none equals a status colour. |
| `lib/tags/{keys,nextColour,order,summaries,api,useTags}.test.ts(x)` | The tables above; routes; `invalidateTagCaches`; the `tags` SSE event and reconnect; lookup by key. |
| `ui/Chip.tagColour.test.tsx` | Chip behaviour and its CSS per colour. |
| `ui/TagColour/{TagDot,TagColourPicker}.test.tsx`, `TagColour.css.test.ts` | Dot, radiogroup, keys, no native control, CSS tokens only. |
| `ui/Select/TagSelect.test.tsx` | Roles, dots, counts, name order, exclude, type-ahead, search. |
| `ui/Gallery.tags.test.tsx`, `ui/index.tags.test.ts` | The Gallery shows each; the barrel exports them. |

The existing `ui/native-controls.test.ts` and `ui-css.test.ts` must keep passing (no native input, tokens only).
