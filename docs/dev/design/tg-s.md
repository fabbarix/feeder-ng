# TG-S: Settings > Tags (design note)

Task TG-S of [tg-plan.md](tg-plan.md) (§3.4, §4.1, §4.3), spec §4.1 and §17, decisions in [ADR 0010](../../adr/0010-tags-as-entities.md), primitives in [tg-ui.md](tg-ui.md), routes in [tg-api.md](tg-api.md). Web only. Test-first: the tests below are red until the Developer fills the stubs. No `features/recipes`, `features/plan`, GLOSSARY, CHANGELOG, spec or Go.

User decisions, final: any User manages Tags; Delete confirms (naming the Recipes and rules, offering "Merge instead") and never refuses; Tags are ordered by name; colours repeat after 10; unused Tags stay.

## 1. What the test author left, and what the Developer does

| Piece | State | Developer work |
|---|---|---|
| `features/tags/strings.ts`, `types.ts`, `fixtures.ts`, `test-utils.tsx` | real | none (copy is pinned by the tests; change both if a sentence must change) |
| `api.ts` (`tagMergeApi.impactInto(id, into)`) | stub | `http.get('/api/tags/${id}/impact?into=${into}')`. `lib/tags/api.ts` has no `into` (TG-UI is merged and not ours), so this one call lives here; the Project Manager may fold it into `lib/tags` later. |
| `lib/{usage,tagName,ruleLine,confirmCopy,focus}.ts` | stubs that throw | plain TypeScript, no React; contracts in §3 |
| `hooks/useTagActions.ts`, `hooks/useTagsPage.ts` | stubs that throw | §4 |
| `components/TagSheet.tsx`, `components/MergeTargetDialog.tsx` | stubs returning `null` | §5 |
| `screens/TagsScreen.tsx` | stub returning `null` | §6 |
| `index.ts` | `routes: []` | add `{ path: '/settings/tags', element: createElement(TagsScreen) }`, no `navItems` |
| `tags.css` | not there | classes only for what ListPage, ListRow, Chip and the pickers do not cover; tokens only |
| `settings/lib/settingsSections.ts`, `settings/strings.ts` | untouched | row `tags` after `planningRules`: title "Tags", meta "Names and colours of Recipe Tags", icon `tag`, path `/settings/tags`, every User; add `'tags'` to the `id` union |
| `app/breadcrumbs.ts` | untouched | `{ path: '/settings/tags', label: sections.tags.title, parent: '/settings' }` |
| `app/pageWidths.ts` | untouched | optional own line `/settings/tags` narrow (the `/settings/*` wildcard already gives it; Courses lists its own) |
| `scripts/lib/page-layout-rules.mjs` | untouched | add `['/settings/tags', 'narrow']` to `ROUTES` |
| `scripts/check-page-layout.modes` | untouched | add `/settings/tags` to `fail_routes` |
| `scripts/check-ui.rules` | untouched | add `web/src/features/tags` to every `*.fail_paths` line |
| `ui/TagColour/TagColourPicker.tsx` | existing | helper and error above the preview (§5.3) |

## 2. Decisions

- **One screen, one sheet, three small dialogs.** The list is `ListPage` > intro, `ListGroup` of `ListRow`s (or `EmptyState`), then **Add Tag**. A row opens the **Tag sheet** (`BottomSheet`). Merge into… is a `Dialog` ("Merge fish into…") with the shared `TagSelect`. The Merge and Delete confirms are `useConfirm().choose` (title, one-paragraph body, `confirmLabel`, and for Delete `alternateLabel: "Merge instead"`, `tone: 'danger'`).
- **The sheet stays open under the dialogs.** A refused, cancelled or failed step leaves the sheet and what was typed; a successful write closes everything. (Cancel on "Merge fish into Seafood?" keeps the typed "Seafood".)
- **Row = pill + usage, not a title.** `ListRow` needs a string `title`, and a Tag name should be the pill, not text beside it. The row uses `leading={<Chip kind="tag" tagColour>name</Chip>}` and `title={usageLine}`; `aria-label={rowLabel}` ("fish, 12 Recipes · 1 Slot Rule · Variety Rule") makes the stretched button's name the Tag. The `li` carries `data-tag-id`. No `ListRow` change.
- **Name rule on the client mirrors Go**: trim, collapse whitespace, case kept, 1 to 40 characters (counted as characters, not bytes), key = `tagKey`. The server stays the judge: a 409 or 422 is handled the same way as the client check.
- **Rename onto another Tag is detected twice**: from the cached list (`checkTagName` says `taken` with `other`), and from `409 tag_name_taken` (`ApiError.details.tag = {id, name, colour}`) when the list was stale. Both open the same merge confirm. On **Add** a taken name is only an error under Name; there is nothing to merge.
- **Merge keeps the target's name and colour**; the sheet's typed colour is not applied by a merge.
- **bothRecipes** comes from `GET /api/tags/{id}/impact?into=<target>` (the source's impact, with the extra field); the target's impact is read in parallel without `into`. `mergeSummary` folds them (`bothRecipes` is `0` when absent, and the sentence leaves the clause out).
- **Every write calls `invalidateTagCaches`** (create, recolour, rename, merge, delete: the four keys `['tags']`, `['slot-rules']`, `['variety-rules']`, `['plan','tags']`), after success only. `useTags` does the same on the `tags` event and on SSE reconnect, so a second device's edit shows without a refresh.
- **Colour label**: "Tag colour" (the GLOSSARY term; spec bullet says "Colour"). Helper: "Colours only help tell Tags apart."
- **Nothing new in lib/tags.** The page reads `useTags`, `nextColour`, `colourCounts`, `mergeSummary`, `deleteSummary`, `tagKey`, `tagsApi`.

## 3. Libraries (`features/tags/lib`, pure)

| File | Contract (tests: same name `.test.ts`) |
|---|---|
| `usage.ts` | `recipesPhrase(n)`: "No Recipes yet" / "1 Recipe" / "12 Recipes". `usageLine({recipes, slotRules, varietyRule})`: the Recipes phrase always, then "1 Slot Rule" / "2 Slot Rules" when any, then "Variety Rule", joined with " · " ("No Recipes yet · 2 Slot Rules" is possible). `rowLabel(tag)`: `${name}, ${usageLine}`. |
| `tagName.ts` | `MAX_TAG_NAME = 40`; `normaliseTagName(raw)`; `checkTagName(raw, tags, ownId?)` gives `{ok, name}` or `{ok:false, reason:'empty'\|'too_long', message}` or `{ok:false, reason:'taken', message, other}`, in that order of checks. The Tag's own key never clashes ("fish" to "Fish" is fine). Messages: "Give the Tag a name.", "A Tag name has at most 40 characters.", "There is already a Tag called Seafood" (no full stop, as the spec). |
| `ruleLine.ts` | `slotRuleWhere(rule)`: "Friday Dinner · Main" (ISO weekday 1 to 7 + Meal Slot name, then Course; missing parts left out; no name gives "Meal Slot"). `slotRuleLine(rule, tagName)`: `${where} = ${tagName}`. Takes the API's `RuleLike` (`ImpactSlotRule` plus optional `mealSlotName`, `weekday`, `courseName`), since `lib/tags` types carry no names. |
| `confirmCopy.ts` | `mergeConfirmCopy(MergeSummary)` and `deleteConfirmCopy(DeleteSummary)` give `{title, body}`; exact sentences below. |
| `focus.ts` | `focusAfterRemoval(order, removedId)`: the next id, else the previous, else `null`; same rule as `settings/lib/courseList`. |

### Confirm copy

Merge, title `Merge ${source} into ${target}?`, body = these sentences in order, joined by one space:

1. recipes > 0: `${source} comes off its ${n} Recipe(s) and ${target} goes on instead` + ` (${both} already has|have both)` when both > 0 + `.`; recipes = 0: `No Recipe has ${source}.`
2. each moved rule: `Slot Rule ${where} = ${source} becomes = ${target}.`
3. each dropped rule: `Slot Rule ${where} = ${source} goes, because ${target} already has a Slot Rule there.`
4. Variety Rule: `${source}'s Variety Rule moves to ${target}.` / `${source}'s Variety Rule goes, because ${target} has its own.` / nothing.

Delete, title `Delete ${name}?`, body: `${name} is on 12 Recipes. Deleting it takes it off them.` (1: `is on 1 Recipe. Deleting it takes it off that Recipe.`; 0: `is on no Recipes.`), then when rules name it ` These go too: the Slot Rule ${where} = ${name}; …; the Variety Rule for ${name}.` Actions: **Delete** (danger), **Merge instead**, Cancel. Delete never refuses, even for an unused Tag.

## 4. Hooks

- **`useTagActions()`**: `create`, `update`, `merge`, `remove` (each `tagsApi` call, then `invalidateTagCaches(client)` on success, nothing on failure; a failure rejects with the `ApiError`), `mergeSummaryFor(source, target)` and `deleteSummaryFor(tag)` (read-only, invalidate nothing).
- **`useTagsPage()`** (all behaviour of the screen; uses `useTags`, `useTagActions`, `useToast`, `useConfirm`):
  - state: `sheet` (`null` / `{mode:'new'}` / `{mode:'edit', tag}`), `mergePicker` (`null` / `{source, targetId}`), `busy`, `newColour = nextColour(colourCounts(tags))`.
  - **`save(values)`** returns `SaveResult` (`{ok:true}` or `{ok:false, error?}`; `error` is shown under Name):
    1. `checkTagName(values.name, tags, editedId)`. Empty, too long: `{ok:false, error}`. Taken on a new Tag: `{ok:false, error: "There is already a Tag called …"}`. Taken on an edit: the merge flow below.
    2. New: `create({name, colour})`, close the sheet, toast `Added X.`, focus the new row.
    3. Edit: send `name` only when the normalised name differs from the stored one (exact), `colour` only when it differs; neither: close, no request. Toast `Renamed to X.` when a name was sent, else `Saved X.`; close; focus the row.
    4. Server refusals: `409 tag_name_taken` as in 1 (new: error; edit: merge flow with `details.tag`); `422` on `field: name`: error "A Tag name has 1 to 40 characters."; anything else: error Toast "Could not save the Tag. Try again." and `{ok:false}`, sheet kept.
    - **Merge flow** (rename onto another Tag, and Review merge): `mergeSummaryFor` (failure: error Toast "Could not check what the Tag is used by. Try again."), `choose({title, body, confirmLabel: 'Merge'})`; Cancel leaves everything (`{ok:false}`); Merge calls `merge(source.id, target.id)`, toast `Merged fish into Seafood.`, closes the dialog and the sheet; a failure keeps them and shows "Could not merge the Tags. Try again."
  - **`openMergePicker` / `setMergeTarget` / `closeMergePicker` / `reviewMerge`**: the picker needs an edit sheet; Review merge does nothing without a target; Cancel in the confirm returns to the picker with the target kept.
  - **`deleteTag()`**: `deleteSummaryFor`, then `choose` with Delete / Merge instead / Cancel; Delete calls `remove`, toast `Removed fish.`, closes the sheet; failure: "Could not delete the Tag. Try again.", sheet kept; Merge instead opens the picker for the same Tag.
  - **Focus** (D2's pattern: a `focusTarget` and a `useEffect`): after add and after rename, the row of that Tag (it may not exist until the refetch lands, so the effect runs again on `tags` and clears the target once it has focused); after merge and delete, `focusAfterRemoval(idsBeforeByName, removedId)`, or the **Add Tag** button when none is left. The row target is `[data-tag-id="N"] .list-row__target` inside `listRef`; Add Tag is `addRef`. A closed sheet or dialog already returns focus to its opener, so a cancel needs nothing.

## 5. Components

1. **`TagSheet`** (`BottomSheet`): title "Add Tag" / "Edit Tag". `TextField` "Name" (focused on open); `TagColourPicker` labelled "Tag colour" with the helper and a `preview` of a `Chip kind="tag" tagColour` showing the typed name ("Tag name" while empty) in a wrapper with `data-testid="tag-preview"`; `FormActions`: primary **Save Tag** (disabled while the name is blank, `loading` while saving; a form submit, so Enter saves), secondary **Merge into…** and `destructive` **Delete Tag** on an edit sheet only. Form state is local and keyed by Tag id so a reopened sheet starts afresh (a new Tag starts with `newColour`). It calls `onSave({name, colour})` with the name as typed; a refusal puts `error` under Name and clears it on the next keystroke; the sheet never closes itself on save (the page does).
2. **`MergeTargetDialog`** (`Dialog`): title "Merge fish into…"; `TagSelect` labelled "Merge into" (`exclude` the source; options by name with dot and count); **Cancel**; **Review merge** (disabled until a target is chosen; `loading` while `busy`).
3. **`TagColourPicker`** (existing, `ui/TagColour`): the reviewer's nit. The `preview` moves out of the `FieldFrame`, so the order is label, swatches, helper or error, preview. It stays outside the radiogroup and keeps `.tag-colour-picker__preview`. The sheet relies on it; `TagColourPicker.preview.test.tsx` pins it.

## 6. Screen

`TagsScreen` composes `ListPage` (header `PageHeader` with `useBreadcrumbs()`; no own page root), in the list slot: intro paragraph (`pg__muted`), the loading `role="status"` "Loading Tags", the load error `role="alert"` "Could not load the Tags.", or the `ListGroup` "Tags" inside a `div ref={listRef}`, or `EmptyState` "No Tags yet" (the Add Tag button below it is the only one); then **Add Tag** (`Button variant="tertiary" icon="add"`, `ref={addRef}`), `TagSheet` and `MergeTargetDialog`. No `useMe` branch: there is no read-only mode. The screen never calls the API or computes a domain value.

## 7. Tests (all in the commit)

| File | Pins |
|---|---|
| `features/tags/lib/{usage,tagName,ruleLine,confirmCopy,focus}.test.ts` | the tables of §3 |
| `features/tags/api.test.ts` | the `?into=` route, `bothRecipes` incl. 0, errors |
| `features/tags/hooks/useTagActions.test.tsx` | writes, the four cache keys after success only, `details.tag` on 409, the two summaries |
| `features/tags/hooks/useTagsPage.test.tsx` | sheet, next colour, Save (new, edit, nothing changed, taken, stale 409, 422, failure), rename onto another Tag, Merge into…, Delete, Merge instead, Toasts |
| `features/tags/components/TagSheet.test.tsx` | `<dialog>` names, radiogroup and swatches, helper description, live pill, Save and Enter, blank, error under Name, Escape, arrows, no native control, reopening |
| `features/tags/components/MergeTargetDialog.test.tsx` | name, options without the source, choose, Review merge enabled/busy, Cancel and Escape |
| `features/tags/screens/TagsScreen.test.tsx` | list (pill colours, usage, order), empty, loading, error, any User, ListPage and source rules, Add, taken, edit, rename, recolour, rename-onto-another with Cancel and Merge, Merge into…, Delete with and without rules, Merge instead, failures, focus after add/rename/merge/delete/last/only |
| `features/tags/index.test.ts` | the route, discovery, no nav item |
| `features/tags/guards.test.ts` | `ROUTES` has `/settings/tags` narrow, `fail_routes`, `check-ui.rules` `fail_paths` |
| `ui/TagColour/TagColourPicker.preview.test.tsx` | helper and error above the preview |
| edited: `settings/lib/settingsSections.test.ts`, `settings/screens/SettingsIndexPage.test.tsx`, `settings/lib/settingsBreadcrumbs.test.tsx`, `app/breadcrumbs.test.ts`, `app/pageWidths.test.ts` | the row after Planning rules, its link, the breadcrumb, the width |

Not tested here, covered elsewhere: the `tags` SSE event and reconnect (`lib/tags/useTags.test.tsx`), the API (TG-API), the visual page in all three schemes (the page-layout guard once `/settings/tags` is in `ROUTES` and `fail_routes`; run `PAGE_LAYOUT=quick scripts/check.sh` after the Developer).
