# WP4: primitives B (overlays, selects, forms, status surfaces)

Spec: [ui-fix-plan.md](../../design/ui-fix-plan.md) 4.6 to 4.10, 4.14, section 7 WP4, and CLAUDE.md "No native browser UI". All work is in `web/src/ui/`.
WP3 (primitives A) merges first: the Developer starts after syncing this branch with `main`. Use WP3's `Button` (`primary secondary tertiary danger`, `icon`),
`IconButton` (`icon`, required `label`), `Chip` (`kind="filter"`, `selected` -> `aria-pressed`), `RecipeThumb`, `Tile` and the `ui/*.css` per component convention.
Tokens are WP1's and icons WP2's: no colour, size or icon literal (guards `colour-literals`, `class-hooks`, `sizing`, `phosphor`).

## Files
| File | State | Notes |
|---|---|---|
| `Dialog.tsx` + `.css` | new (stub) | modal `<dialog>`; props in the stub |
| `ConfirmDialog.tsx` | new (stub) | `ConfirmDialog` (controlled), `ConfirmProvider`, `useConfirm()` -> `{ confirm, choose }` |
| `BottomSheet.tsx` + `.css` | **rewrite** | not touched yet (WP3 moves its CSS); new API below |
| `Toast.tsx` + `.css` | **rewrite** | not touched yet; new API below |
| `Stepper.tsx` + `.css` | **rewrite** | not touched yet; new API below |
| `Select/{Select,RecipeSelect,IngredientSelect,UnitSelect,ShopSelect,MealSlotSelect,MemberSelect}.tsx`, `lib.ts`, `options.tsx` | new (stubs) | `Select`+`MultiSelect` core, pure `lib.ts`, pure-ish mappers `options.tsx` |
| `fields/{TextField,TextArea,NumberField,TimeField,DateField,Checkbox,Switch,Segmented,RadioCards,Slider,ColorSwatches,FileDrop,SearchField}.tsx` | new (stubs) | shared `Field.ts` (`FieldProps`) |
| `fields/{number,time,calendar,color,accept}.ts` | new (stubs) | pure helpers, unit-tested |
| `OfflineBanner.tsx`, `Skeleton.tsx`, `ErrorState.tsx` (+ `.css`) | new (stubs) | |
| `lib/useMediaQuery.ts` | Developer adds | `useMediaQuery(q)`; returns `true` when `matchMedia` is missing (jsdom => desktop) |
| `index.ts` | Developer extends | exports everything above (after the WP3 rewrite) |
| `icons.ts` | Developer adds `minus` (`MinusIcon`) | needed by Stepper/NumberField; shared with WP2, keep the diff to one entry. Any other missing glyph: same rule |
| `strings.ts` | avoid | put new copy in `ui/overlayStrings.ts`, `ui/Select/strings.ts`, `ui/fields/strings.ts` (WP3 edits `strings.ts`) |

Shared file touched by the Designer: `web/src/test/setup.ts` (3 lines) plus new `web/src/test/dialogPolyfill.ts` (+ its test). The polyfill gives jsdom
`show/showModal/close` with `open`, `returnValue`, the cancelable `cancel` event on Escape (topmost modal only), `close` event, initial focus (`[autofocus]`, else first focusable,
else the dialog) and focus restore on `close()`. It does NOT make the rest of the page inert, and focus is not restored when React merely unmounts the dialog:
**the components must restore focus to the trigger themselves** (the tests assert that).

## Decisions
- **Dialog**: unmounted while `open` is false; on mount calls `showModal()` in a layout effect, remembers `document.activeElement`, and on unmount/close focuses it again (if still connected).
  `onCancel` (Escape) calls `preventDefault()` and `onClose()`; the parent owns `open`. Backdrop click = a `click` whose `target` is the `<dialog>` element itself (the panel inside fills the box, `dialog` has no padding),
  skipped when `dismissOnBackdrop={false}`. Initial focus: `initialFocusRef`, else `[data-autofocus]`, else first focusable, else the `h2` (`tabIndex=-1`, no outline); the `<dialog>` itself is never focused.
  Attributes: `aria-labelledby` -> title, `data-tone`, `data-primary-scope` (WP3's single-primary warning). CSS: `::backdrop` = `var(--scrim)`, 240 ms scale/fade, reduced motion = fade only.
- **ConfirmDialog**: danger focuses Cancel (`data-autofocus`), default focuses the confirm button; danger ignores the backdrop; Escape always cancels. `useConfirm().confirm` resolves `boolean`,
  `choose` resolves `'confirm' | 'alternate' | 'cancel'` (the Recipe delete: Cancel / Archive instead / Delete). One dialog is hosted by `ConfirmProvider` (mounted in the app shell by WP5; until then each screen team wraps in `main.tsx`); requests made while one is open queue.
  Focus returns to the element that was focused when `confirm()` was called.
- **BottomSheet** (new API): `{ open, onClose, title, children, footer? }`. A `<dialog class="sheet">`; header = `h2` title + `IconButton icon="close" label="Close"`; `.sheet__body` scrolls; `.sheet__footer` sticky.
  Initial focus: first interactive element of body/footer (not the Close button), else the title. `data-primary-scope`. CSS: radius 28 top, grab handle, `max-height: 85dvh`, safe area, `@media (min-width: 768px)` centred dialog. The old `bottom-sheet-backdrop` test-id is gone; the old BottomSheet describe was removed from `Overlays.test.tsx` and replaced by `BottomSheet.dialog.test.tsx`.
- **Toast** (new API): `ToastOptions { status?: 'neutral'|'success'|'error'|'info'; actionLabel?; onAction?; durationMs? }`; `tone` kept as deprecated and mapped to `neutral`. Item `role=status` (error: `role=alert`), `data-status`, leading Icon (`success`/`error`/`info`), message,
  optional tertiary action, close `IconButton` "Dismiss". Timing 4 s, 6 s with an action, errors never auto-dismiss, explicit `durationMs` always wins. Stack max 2 (oldest dropped). Swipe-down dismiss is pointer-event code, verified manually/in Gallery (not unit-tested).
- **Stepper** (new): `role=group` named by `label`; value is a `role=spinbutton` (`aria-valuenow/min/max`, ArrowUp/Down step, Home/End to bounds); ± are `IconButton`s ("Decrease/Increase <label>"); decimals rounded to the step's precision (`stepValue`, shared with NumberField).
- **Select**: trigger = `<button role=combobox aria-haspopup=listbox aria-expanded aria-controls>` named by its label (`aria-labelledby`); Enter/Space/ArrowDown/ArrowUp/click open. On open the active option is the selected one, else the first enabled.
  DOM focus stays on one element (search input when searchable, else the listbox/trigger) and the active option is exposed with `aria-activedescendant`; arrows, Home/End, type-ahead (`typeAheadMatch`, 500 ms buffer), Enter selects, Escape and Tab close, outside click closes; closing always returns focus to the trigger.
  Search appears when `searchable` or more than 8 options (`filterOptions`, accent- and case-insensitive, every word must match label/meta/keywords). Filters = `Chip kind="filter"` (AND). Sorts: one `IconButton icon="sort" label="Sort: <current>"` that **cycles** the sorts (decision: cheaper than a menu). Groups: `role=group` with `aria-labelledby` its sticky overline.
  Empty: "No <entityName> matches 'xyz'"; `onCreate`+`createLabel` add a trailing `role=option` "Create ..." row unless the query equals a label. Disabled options: `aria-disabled`, skipped by arrows.
  Presentation: `useMediaQuery('(min-width: 768px)')` true -> absolutely positioned 360 px popover; false -> the same content inside `BottomSheet` (so `role=dialog` named by the label). `MultiSelect`: `aria-multiselectable`, picking toggles and keeps it open, trigger shows the labels joined by ", ".
- **Domain selects** take plain data (`RecipeChoice`, `IngredientChoice`, `UnitChoices`, `ShopChoice`, `MealSlotChoice`, `MemberChoice`, defined in `Select/options.tsx`, structurally compatible with the feature types) and callbacks; no fetching, no imports from `features/`.
  `RecipeSelect`: Tag filter chips from the distinct Tags, sorts Name then Last cooked (most recent first, never-cooked last), thumbnail via `RecipeThumb`. `IngredientSelect`: Base Unit badge+meta, default `onCreate` label `Create Ingredient "<q>"`. `UnitSelect`: groups Base Unit / Unit Conversions / Units. `MealSlotSelect`: grouped by weekday (names overridable for i18n), slot icon from `lib/mealSlotIcon`. `MemberSelect`: `MultiSelect` with `Avatar`.
- **Fields** share `Field` anatomy: label above (13/700), 48 px control, helper, error (`WarningCircle` 14, status-danger-fg), `aria-describedby` = helper + error ids, `aria-invalid` when error. `required` -> `aria-required`.
  - `TextField`/`TextArea`: controlled, `onChange(value)` per keystroke. `SearchField`: the only `type="search"` (`role=searchbox`), clear button "Clear search" (refocuses), Escape clears, Enter `onSubmit`; native cancel glyph hidden by CSS.
  - `NumberField`: `type="text" inputmode="decimal" role=spinbutton`; **commit-based** (blur, Enter, arrows, ±), accepts "2,5"; clamps to min/max and rewrites the text; invalid text reverts without `onChange`; empty commits `null`. Value `.`-formatted (locale display is a later task).
  - `TimeField`: value `"HH:mm"` or `""`; two `role=spinbutton` segments (Hour 0-23, Minute 0-59) in a `role=group`; arrows wrap without carry; typing 2 digits advances; a first digit 3-9 in Hour pads and advances; Hour > 23 clamps to 23; placeholders `––`; `minuteStep`. No AM/PM anywhere, no native time input.
  - `DateField`: value ISO `YYYY-MM-DD`; trigger button + calendar `role=dialog` popover (non-modal, closes on Escape/outside click, focus back to trigger), `role=grid`, Monday-first, day buttons named with the long date ("10 November 2026"), `aria-selected`, `aria-current="date"`, `data-outside`, `aria-disabled` outside `min/max`; arrows ±1/±7 (crossing months), PageUp/PageDown ±1 month (day clamped), Enter/Space select; `locale` default `en-GB`; `today` injectable for tests.
  - `Checkbox`: visually hidden native `input type=checkbox` + `.checkbox__box` with a `Check` icon; `indeterminate`. `Switch`: `button role=switch`. `Segmented` and `RadioCards`: one shared roving-tabindex `radiogroup` hook (buttons `role=radio`, `aria-checked`, arrows select and wrap, Home/End, disabled skipped).
  - `Slider`: `role=slider` thumb on `.slider__track`, pointer press/drag snaps to the nearest step (guard `setPointerCapture?.`), keys Arrow/Home/End/PageUp/PageDown, `stops` give labels and `aria-valuetext`. `ColorSwatches`: radiogroup of 40 px circles; `allowCustom` adds "Custom" which opens a `Dialog` "Custom colour" with a "Hue" `Slider` and a "Hex colour" `TextField`; "Use colour" applies the normalised hex, disabled with `aria-invalid` on a bad hex; Escape returns focus to Custom.
  - `FileDrop`: `[data-testid=file-drop-zone]` zone (dashed, `FileArrowUp` -> icon `file`), button "Choose a file or drop it here" clicks the hidden `input type=file`; `data-dragging` while dragging; `acceptsFile` splits accepted / `onReject`; only the first file unless `multiple`; disabled ignores drops.
- **Status surfaces**: `OfflineBanner` (`role=status aria-live=polite`, `Offline · showing what was saved at 14:02`, `3 Scans waiting to sync`, singular `1 Scan`, hidden at 0, null when online; 24 h local clock). `Skeleton` (null for `delayMs` = 300, then `.skeleton[data-variant]` blocks `aria-hidden` plus one visually-hidden "Loading" in a `role=status aria-busy`; shimmer 1.2 s, off with reduced motion). `ErrorState` (`role=alert` danger tile, `error` icon, message, optional "Try again").
- Hooks that expose `status: 'loading'|'error'|'offline'|'empty'|'ready'` are the screen teams' (WP6-WP11); these primitives only render the states.

## Tests (all red until implemented, except the polyfill and native-controls guard)
`test/dialogPolyfill.test.ts` (green); `Dialog`, `ConfirmDialog`, `BottomSheet.dialog`, `Toast.v2`, `Stepper`, `OfflineBanner`, `Skeleton`, `ErrorState`, `overlays-css` (needs `Dialog.css`, `BottomSheet.css`, `Toast.css`, `Skeleton.css`); `Select/{lib,options,Select,DomainSelects}`; `fields/{number,time,calendar,color,accept}` (pure) and `fields/{TextFields,NumberField,TimeField,DateField,Choices,Slider,ColorSwatches,FileDrop}`; `native-controls.test.ts` (green: no native `<select>`/alert/confirm/prompt in `ui/`; pickable `<input type>` only in `fields/Checkbox|FileDrop|SearchField.tsx`).
Type errors expected until the rewrite: `BottomSheet.dialog.test` (`footer`) and `Toast.v2.test` (`status`), because `BottomSheet.tsx`/`Toast.tsx` are intentionally untouched. The existing `Controls.test` Stepper block and the Toast block of `Overlays.test` must keep passing.
Not unit-testable in jsdom (verify in the Gallery/dev server): inertness of the page behind a modal, Tab trapping, `::backdrop`, popover positioning, swipe-to-dismiss, real pointer drag. `Gallery` (WP3) gets a WP4 section: every primitive in light and dark.

## How feature teams map the QA native-control sites to primitives
Each site below is removed from the feature; the Developer of the screen WP replaces it as listed. `native-ui`/`native-search` guard modes go to `fail` once WP11 lands.
| Site (QA inventory) | Replace with |
|---|---|
| `RecipeDetailScreen.tsx:54` `window.confirm` | `useConfirm().choose({ title: 'Delete <name>?', body: 'It is removed from future Planned Meals. Archive keeps it for history.', tone: 'danger', alternateLabel: 'Archive instead', confirmLabel: 'Delete' })` |
| `UnknownBarcodeSheet:95`, `AddLotSheet:45`, `AddShopBarcodeSheet:57`, `ExtraSheet:57` (selects) | Unit -> `UnitSelect` (needs the Ingredient's Unit Conversions), Ingredient -> `IngredientSelect`, Shop -> `ShopSelect` |
| `WeightRuleEditor:54,62`, `RulesEditors:53,63,76` | Recipe -> `RecipeSelect`, Ingredient -> `IngredientSelect`, Meal Slot -> `MealSlotSelect`, Tag (Variety Rule) -> `Select` with the existing Tags as options |
| `PriceEditor:38` | `ShopSelect` |
| `StepsEditor:49`, `IngredientLineRow:70` | `UnitSelect` / `IngredientSelect` |
| `MealSlotEditor:52`, `MemberEditor:69` | weekday -> `Select` (or `MultiSelect` to add several weekdays at once, per QA Settings note); linked User -> `Select` over unlinked Users only |
| `AddLotSheet:58` (date), `PriceEditor:53` (date), `DateAttendancePanel:44` (date) | `DateField` |
| `HouseholdSettingsForm:47,52,59,69,74`, `PreferencesForm:59,72` (number/time) | `NumberField` (Planning Horizon `min=1 max=28`), `TimeField`, `Segmented` for unit system/theme, `Switch` for toggles |
| `MealSlotEditor:64`, `MemberEditor:54` (time, colour) | `TimeField`; colour -> `ColorSwatches allowCustom` |
| `PlannerStyleSlider:25` (range) | `Slider` with the three `stops` |
| `ImportSource:37`, `PhotoPicker:24` (file) | `FileDrop accept=".json,..."` / `accept="image/*"` |
| Checkboxes: `MergeConflictList:50`, `NotificationSettingsView:101`, `UnknownBarcodeSheet:127,131`, `StepsEditor:77`, `RecipeDetailsFields:33`, `IngredientLineRow:79`, `RulesEditors:142`, `AllowlistPanel:65`, `AttendanceEditor:32`, `PreferencesForm:64` | `Checkbox` (on/off settings such as notifications: `Switch`) |
| `RadioGroup:16` | `RadioCards` (2-4 choices with explanation) or `Segmented` (short labels) |
| `type=search`: `IngredientsScreen:42`, `RecipesScreen:50`, `ProductsScreen:17`, `AddShopBarcodeSheet:45` | `SearchField` |
| Any `BottomSheet` consumer | unchanged call (`open onClose title`); optionally `footer` for actions |
| `Toast` consumers | `show(message, { status })`; errors also inline in the form |
| Offline / loading / error regions | `OfflineBanner` in the shell (WP5), `Skeleton`, `ErrorState` |
