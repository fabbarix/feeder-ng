# R2-1: Recipes adoption (centred editor, section cards, compact fields, sticky bars, ui/Menu)

Source: `docs/design/ui-review-2.md` (R2-1 row: L-02, E-01, E-02, E-03, D-01, D-02, F-01 adoption, S-02 recipes part, L-03 for the editor and Cook entry), `docs/dev/design/r2l-page-layout.md` section 8 (G-01 `ui/Menu` spec), the P4/P6 findings of the page-layout guard on `/recipes/:id`, `/recipes/:id/edit`, `/recipes/new`, and the shared `warning` icon.
Tests first and red. Production code in this commit is type-only stubs: `ui/Menu/{Menu.tsx,useMenuKeys.ts,index.ts}`, `RecipeSectionIndex.tsx`, `RecipesOverflowMenu.tsx`, the `'form'` value of `StickyActionBar.column`, the `ui/index.ts` exports. `scripts/check-page-layout.modes` is already flipped (it is a test expectation).

## Scope and ownership

In: `features/recipes/**`, `ui/Menu/**` (new), `ui/index.ts`, `ui/Gallery.tsx` (Menu section only), `ui/icons.ts` (one line), `ui/StickyActionBar.{tsx,css}` (one new column value), `scripts/check-page-layout.modes`, `scripts/lib/page-layout-rules.mjs` (`warn_routes`, section 7), and `app/YourMenu.tsx` (key handlers only, section 2.4).
Not in: `features/import/**` (WP-E: `RecipeFileActions` is no longer used by Recipes, the hook `useAgentPrompt` and the strings still are), the image fields (IM2 owns `PhotoPicker`, `StepPhoto`, `usePhotoUpload`, the Photo section; see section 8), R2-2/3/4 folders.

## 1. Layout (L-02, E-01, D-01, D-02)

The shell already wraps both routes in `<Page width="default">` (1120 content). The screens set **no width**.

### Editor (`RecipeEditorScreen`)
```
<div class="recipe-editor-layout">                    grid from 1280: [1fr | minmax(0,840px) | 1fr]
  <RecipeSectionIndex .../>                           <nav class="recipe-editor__index" aria-label="Sections">, column 1, sticky
  <section class="recipe-editor">                     inline-size 100%, max-inline-size 840px, margin-inline auto, flex column gap space-4
    <PageHeader .../>                                 inside the column, so title and breadcrumbs line up with the cards
    <Tile as="section" id="recipe-section-details"     class "recipe-editor__section", aria-labelledby its h2 ("Details")
    <div id="recipe-section-photo">…PhotoPicker…</div> (IM2 decides the markup; the id is the anchor)
    <Tile as="section" id="recipe-section-ingredients">
    <Tile as="section" id="recipe-section-steps">
    errors, dialogs (Unit Conversion prompt, rename ConfirmDialog, NewIngredientSheet)
  </section>
</div>
<StickyActionBar label="Recipe actions" column="form"> <FormActions tertiary=Cancel primary="Save Recipe"/> </StickyActionBar>
```
- The `StickyActionBar` is a sibling of the column **inside the Page body** (not inside `.recipe-editor`, not in a card), so its edges are the Page edges (guard P6). `column="form"` (new) aligns the inner row to the 840 px column: `.sticky-action-bar[data-column='form'] .sticky-action-bar__inner { max-inline-size: 840px }`. `.recipe-editor__footer` is deleted.
- `.recipe-editor` loses the `@media (min-width: 768px) { max-inline-size: 760px }` rule. `.recipe-detail` and `.steps-list` lose theirs too (the Page caps at 1120).
- Section index: always in the DOM; `display: none` below 1280; from 1280 `position: sticky; inset-block-start: var(--space-6)` in column 1, `justify-self: end`. Links are `<a href="#recipe-section-…">`; the one clicked, or the one an `IntersectionObserver` reports first, gets `aria-current="true"` (styled with the accent). No observer: only click state. `.recipe-editor__section { scroll-margin-block-start: var(--space-4) }`, and the sticky bar's `scroll-padding-block-end` is already global.
- Sections are Details, Photo, Ingredients, Steps. The review also lists "Planning"; its fields (Cool-down, Use-by, Reheat) are named in the Details row of the same bullet, so they stay in Details (question 1).

### Ingredient lines: one row from 720 px
- A header row `.recipe-editor__lines-head` (`aria-hidden="true"`, `display: none` below 720, `display: grid` from 720, **same `grid-template-columns` as `.line-row`**) captions the columns: Ingredient, Quantity, Unit, Note.
- `.line-row` from 720: `grid-template-columns: minmax(0, 1fr) 88px 120px minmax(0, 1fr) auto auto` = Ingredient · Quantity `xs` · Unit `sm` · Note · Optional chip · remove IconButton. `.line-row__amount` and `.line-row__extras` become `display: contents`; `.line-row__ingredient` is `grid-column: auto` (it stays `1 / -1` below 720, where the row is two lines: Ingredient on the first, Quantity · Unit · Optional · remove on the second). The unit-conversion hint `.line-row__hint` spans the row (`grid-column: 1 / -1`).
- From 720 the row has `background: none` and a `border-block-end: 1px solid var(--color-line)`; the card background stays below 720.
- From 720 the labels inside a row are visually hidden (`.line-row .ui-field__label`: absolute + `clip-path: inset(50%)`, 1 px), still in the accessibility tree; the caption row names the columns for sighted users. Note has `placeholder="note"`.
- No drag handle: lines cannot be reordered today (question 2).
- **"Optional" is a visible toggle**: a filter `Chip` with the text "Optional" (`aria-pressed`), replacing the checkbox. No `title`, no `aria-label` (E-01, user decision 3.7). `recipeStrings.lines.optional = 'Optional'` (`recipeStrings.optional` stays lower case for the detail list).
- Sizes: IngredientSelect `full`, Quantity `xs`, UnitSelect `sm`, Note `full`.

### Details fields (F-01 adoption)
Name `lg`; Description `full`; one `FieldRow` of Yield (`xs`, **with the stepper**: a compact `[−] 4 [+]`), Cool-down `xs`, Leftover Use-by `xs`, Reheat time `xs` (day and minute fields stay plain digits: blank means "household default"); Ready Meal checkbox; Tags; one `FieldRow` of Source link `lg` and Attribution `md`.

### Tags: a chip input
`<div class="tag-input" role="group" aria-label="Tags" data-size="md">` with one `.tag-input__control` (flex, wrap) holding the chips (filter chips, pressed; choosing one removes the Tag) **then** the "Add a Tag" TextField on the same line. Enter or comma adds; blur adds; **Backspace in the empty field removes the last Tag**. `.tag-input { max-inline-size: 320px }`; `.tag-input__tags` is deleted.

### Steps (E-02, E-03)
Card: `step-card__head` (number badge · actions) → Step text (TextArea) → **`FieldRow.step-card__timing`** with Kind (`Segmented`) and Duration or Lead time (`NumberField size="xs" unit="min"`, label unchanged) → "After step" chips (unchanged) → Uses → errors. (The Step photo is IM2's `ImagePicker`; the "Add photo" IconButton that expands a drop zone is not needed once the picker exists.)
- Actions: Remove stays an IconButton; **reordering moves into a `Menu` "Step actions"** (Move Step up, Move Step down; the first/last is `disabled`). There is no drag and drop, so the "drag handle" of the review is not built (question 2).
- Uses: no empty "Uses" overline. With uses, the label and the rows show; the add control is a `Chip icon="add"` named "Add ingredient use" in `.step-card__uses` (flex, wrap).
- `ol.steps-editor__list` gets `margin: 0; padding: 0; list-style: none`, so Step cards sit at the same depth as ingredient lines (E-03: they were 32 px deeper because of the browser's list indent).

### Recipe detail (D-01, D-02, L-03)
```
<section class="recipe-detail">
  PageHeader (Edit, More actions Menu)
  <div class="recipe-detail__layout">                 grid from 1280: 360px minmax(0,1fr), align-items start
    <div class="recipe-detail__aside">                flex column; sticky from 1280 (inset-block-start space-6)
      hero · metrics · Ingredients tile · (>= 1280 only) <CookEntry/>
    <div class="recipe-detail__main">                 Steps tile · Preferences tile
  </div>
  (< 1280 only) <StickyActionBar label="Cook"><CookEntry/></StickyActionBar>   sibling of the layout, in the Page body
</section>
```
- The screen reads `useMediaQuery('(min-width: 1280px)')` and renders the Cook entry once: in the aside from 1280, in the bar below. (jsdom answers "true": the wide layout is the default in tests.)
- `.cook-entry` loses `position: sticky`, `bottom`, the surface and the shadow (the bar owns them). Inline in the aside it is a column: Batches `Stepper size="sm"`, the hint, a full-width button.
- Hero: `aspect-ratio: 16 / 9`, no `max-block-size: 170px` (the strip is gone, D-02), `.recipe-detail__hero { max-inline-size: 820px; margin-inline: auto }` below 1280 and `max-inline-size: none` from 1280 (the aside is 360 px). The existing 5.9 CSS tests change accordingly.

## 2. ui/Menu (G-01)

### 2.1 API
```ts
interface MenuItem { id: string; label: string; icon?: IconName; tone?: 'danger'; href?: string; checked?: boolean; disabled?: boolean; onSelect?: () => void }
type MenuEntry = MenuItem | { separator: true }
<Menu label="More actions" icon="more" title="More" items={MenuEntry[]} />
```
`Menu` renders its own `IconButton` (`aria-haspopup="menu"`, `aria-expanded`, name = `label`), so callers pass no trigger element (the sketch in r2l section 8 passed one; owning the button is what makes focus return and the anchor rect reliable). `useMediaQuery('(min-width: 768px)')` chooses the presentation.

### 2.2 Popover (>= 768 px)
- `role="menu"` named `label`, in a portal on `document.body` (a transformed ancestor would break `position: fixed`). `position: fixed`, `top`/`left` in px from the trigger's `getBoundingClientRect()`; `data-placement="below|above"`: below with an 8 px gap unless it would pass the viewport bottom minus 8, then above; right edge aligned to the trigger's right edge, then clamped to `[8, innerWidth - width - 8]`.
- Items: `role="menuitem"` (`<button>`, or `<a>` through react-router for `href`), `role="menuitemcheckbox"` + `aria-checked` for `checked`, `aria-disabled="true"` for `disabled` (not run, skipped by arrows), `data-tone="danger"`, a 20 px glyph, 48 px rows. `{separator:true}` is `role="separator"`.
- Select: `onSelect()`, close, focus back to the trigger. A second click on the trigger or a pointer-down outside closes (document listener, no scrim). Escape/Tab: `useMenuKeys`.
- CSS (`ui/Menu/Menu.css`): `.menu` (fixed, z-index 20, surface, `--elev-2`, radius token, `inline-size: 240px`, `max-inline-size: calc(100vw - 2 * var(--gutter))`), `.menu__item` (+ `:hover` soft, `[data-tone='danger']`, `[aria-disabled='true']` muted), `.menu__divider`. Tokens only.

### 2.3 Sheet (< 768 px)
A `BottomSheet` titled `title ?? label` with a `ListGroup` of `ListRow`s: a button row per item, a link row for `href`, a row with a trailing `Switch` (named by the label) for `checked`. Choosing a row runs `onSelect` and closes the sheet.

### 2.4 useMenuKeys
`useMenuKeys({ open, onClose, menuRef, triggerRef }) => { onMenuKeyDown }`, extracted from `YourMenu`: focus the first enabled item on open; ArrowDown/ArrowUp wrap, Home/End; `[role="menuitem"], [role="menuitemcheckbox"]` that are not `aria-disabled`; Escape (document listener) and Tab (`preventDefault`) call `onClose` and focus the trigger. **`YourMenu` adopts it** (test `app/YourMenu.useMenuKeys.test.ts`): only its `useEffect`s and `onMenuKeyDown` change. R2-3 also edits `YourMenu.tsx` (S-01, the item icons), so if the PM prefers, this adoption can move to a follow-up after R2-3 merges; delete that test file then.

### 2.5 Call sites
- `RecipeDetailScreen`: `<Menu label="More actions" title="More" items=[Archive|Unarchive, Delete (danger)]>`; the `BottomSheet` and `sheetOpen` state go.
- `RecipesScreen`: `RecipesOverflowSheet` is replaced by `RecipesOverflowMenu` in the header actions: Import (`href /recipes/import`, icon `import`), Export (`/recipes/export`, `export`), Copy Agent Prompt (`agentPrompt`; calls `useAgentPrompt().copy()`, and an `AgentPromptNotice` is mounted while the state is copied/failed), Show archived (`checked`, `onSelect` toggles). The strings come from `importStrings` (`importAction`, `exportAction`, `copyAgentPrompt`). Delete `RecipesOverflowSheet.tsx`, its `recipes-overflow__archive` CSS; `RecipeFileActions` stays in `features/import` (unused by Recipes; WP-E decides).
- Gallery: a "Menu" group (h3 "Menu") in both scheme blocks with one working trigger.

## 3. Shared `warning` icon
`ui/icons.ts` maps `warning` to `HourglassMediumIcon` (the glyph of `useSoon` and `goesOff`). Change it to Phosphor **`Warning`** (the triangle: a warning is not an error, and `error`/`spoiled` keep `WarningCircle`; two names with one glyph would also violate the registry test). `WarningIcon` is **not** imported yet, so this adds one icon (about 0.4 kB of the ~0.76 kB headroom the icon budget test has). Users of `warning`: `recipe-assistant/components/SecretKeyMissingTile.tsx` (`<Icon name="warning">`) and nothing else (Chip, ListRow and ErrorState use status names or `error`). `AttendeePills.test.tsx` already pins the circle for "Nobody attending" through `error`, unaffected. The registry table in `ui/icons.test.tsx` changes `['warning','HourglassMedium']` to `['warning','Warning']`.

## 4. Strings to add (`recipes/strings.ts`, `ui` has none new)
`lines.optional = 'Optional'`; `lines.captions` (Ingredient, Quantity, Unit, Note, reuse `lines.*`); `sections = 'Sections'` (index label); `editorActions = 'Recipe actions'`; `steps.actions = 'Step actions'`; `cook.barLabel = 'Cook'`; `fields.tags` already exists (group name "Tags"). Glossary: no new term.

## 5. S-02 (recipes part)
`IngredientLinesList` shows `displayName(name)` from `features/ingredients/lib/names` (first letter capitalised; stored names stay lower case). The Exclusion IconButton's accessible name ("Exclude garlic") and the step "Uses 2 clove garlic" sentence keep the stored name. The editor's pickers are untouched (the selects own their text).

## 6. Page-layout guard
`scripts/check-page-layout.modes`: `fail_routes=/recipes/:id /recipes/:id/edit /recipes/new`. Because `:id` matches any segment, `/recipes/:id` also matches `/recipes/import` and `/recipes/export`, which belong to R2-4 and the Recipe Assistant and would then fail this package's merge. So `modeFor` learns **`warn_routes`** (a list that wins over `fail_routes`; the modes file lists `/recipes/import /recipes/export`). Tests: `features/recipes/pageLayout.fail.test.ts`. R2-4 removes the two entries when it flips them.
What the guard checks on these routes and how this package meets it: P3 width (no 760 cap, Page 1120 / editor column 840); P2 centring (column `margin-inline: auto`; the detail fills the Page); P4 short fields (Yield, Cool-down, Use-by, Reheat, Quantity, Duration all `xs`/`sm`); P5 text fields (Name `lg`, Note `full`, none collapses below 160 px: Note keeps `minmax(0, 1fr)`); P6 bar (`StickyActionBar` in the Page body, opaque); P9 `data-page-width` is the shell's.

## 7. Tests (all new and red, except where noted)
| File | Covers |
|---|---|
| `ui/Menu/Menu.test.tsx` | trigger, popover items, tones, links, checkable, disabled, separator, keys, closing, placement and flip, sheet below 768, breakpoint switch |
| `ui/Menu/Menu.css.test.ts`, `useMenuKeys.test.tsx`, `Menu.exports.test.tsx` | CSS contract, the hook, barrel and Gallery |
| `app/YourMenu.useMenuKeys.test.ts` | YourMenu adopts the hook |
| `ui/StickyActionBar.form.test.tsx` | `column="form"` (the attribute test passes against the stub; the CSS one is red) |
| `ui/icons.test.tsx` (edited), `ui/icons.warning.test.tsx` | the `warning` glyph |
| `features/recipes/recipes.layout.css.test.ts` (+ `rules.test-helper.ts`) | every CSS contract above |
| `recipes.css.test.ts` (edited) | hero 16:9 instead of the 170 px strip |
| `components/RecipeSectionIndex.test.tsx` | the index |
| `screens/RecipeEditorScreen.layout.test.tsx` | layout wrapper, header inside the column, sections and ids, lines caption row, `StickyActionBar` (group, `form` column, Page body, not inside the column), no own width |
| `components/RecipeDetailsFields.sizes.test.tsx`, `TagInput.test.tsx`, `IngredientLineRow.sizes.test.tsx` (+ `IngredientLineRow.test.tsx` edited) | sizes, FieldRow, stepper Yield, chip input, "Optional" chip |
| `components/StepsEditor.layout.test.tsx` (+ `StepsEditor.test.tsx` edited) | timing FieldRow, xs "min", Step actions menu, Uses chip |
| `screens/RecipeDetailScreen.layout.test.tsx`, `components/CookEntry.layout.test.tsx` (+ `RecipeDetailScreen.test.tsx` edited) | two-column detail, bar below 1280, More Menu (popover and sheet), compact Stepper |
| `components/RecipesOverflowMenu.test.tsx` (replaces `RecipesOverflowSheet.test.tsx`; `RecipesScreen.test.tsx` edited) | the Recipes Menu |
| `components/IngredientLinesList.displayName.test.tsx` (+ `IngredientLinesList.test.tsx` edited) | S-02 |
| `features/recipes/pageLayout.fail.test.ts` | the fail routes and `warn_routes` |

## 8. Dependencies and merge order
- **IM2** (`team/im2-image-fields`, not merged when this was written) rewrites `PhotoPicker`, `StepPhoto`, `RecipeEditorScreen` (photo lines), `recipes.css` (`.step-card__photo`, `.step-card__error`) and several recipe tests. R2-1 owns none of the photo behaviour; the tests here avoid it (the Photo section is only an anchor). The developer rebases on IM2 if it lands first; the conflicts are mechanical (the editor screen's photo lines, two CSS rules, the old `usePhotoUpload` mock in `RecipeEditorScreen.test.tsx`).
- **R2-3** edits `app/YourMenu.tsx` (section 2.4).
- `ui/index.ts` and `ui/Gallery.tsx` are serialised by the PM (R2-1 adds the Menu lines at the end of the barrel).
