# R2-3 Settings and catalogue adoption (design note)

Source: `docs/design/ui-review-2.md` (R2-3 row), `docs/design/ui-fix-plan.md`. Scope: `web/src/features/{settings,ingredients,products,shops}/**`.
Uses the merged primitives: field `size` (xs 112 / sm 168 / md 320 / lg 480 / full), `FieldRow`, `FormActions` (classes
`.form-actions__{destructive,tertiary,secondary,primary}`), `Page` widths, `Button block`, `PageHeader actions`.
Out of scope here: `ui/**` (R2-1), `plan/**` (R2-2), `app/nav.ts` and `YourMenu.tsx` (S-01, see questions). Product pictures
(ImagePicker on Product page, sheet, rows, scan results) and more Ingredient pictures come after this team: leave room, build nothing.

Glossary: Ingredient, Base Unit, Shelf Life, Product, Shop, Shop Barcode, Weight Barcode Rule, Price. No `_Avoid_` words.

## Items

| Item | What changes | Tests (red until done) |
|---|---|---|
| L-06 widths | Already in `ROUTE_WIDTHS` (settings, ingredients, products narrow; meal-slots default). Verify only. | `settings/settingsWidths.test.ts` (green) |
| F-02 Allowlist | Done by A1. Verify only. | existing `allowlist.css.test.ts`, `AllowlistPanel.layout.test.tsx` (green) |
| F-05 Base Unit | `IngredientScreen`: drop the `<fieldset disabled><legend>` and the duplicate `<Chip>{baseUnit}`. Unlocked: radiogroup "Base Unit" with icon, tick and helper (`BaseUnitPicker`, as in the New Ingredient sheet). Locked (referenceCount > 0): no radiogroup; a read-only row `data-testid="base-unit-value"` showing "Base Unit" and the value once, plus `strings.baseUnitLocked(n)`. CSS: rename the picker rules `.new-ingredient__{section,label,options,unit}` to `.base-unit`, `.base-unit__label/options/option/helper`, add `.base-unit__value` (the sheet keeps `.new-ingredient__helper` for its own reason line). | `IngredientScreen.r2-3.test.tsx`, `IngredientScreen.test.tsx` (3 updated), `ingredients.css.test.ts` |
| F-05 Shelf Life | `ShelfLifeEditor`: one `NumberField` label "Shelf Life" (`strings.shelfLifeLabel` becomes `'Shelf Life'`), `size="xs"`, `unit="days"`, `min={1}`; remove the `{days} days` paragraph (keep `strings.noShelfLife` as the field helper while empty); Save (primary) and Clear (destructive, only while set) in `FormActions`. NumberField commits on blur, so typing then clicking Save works; 0 clamps to 1. Guard P4 "Shelf Life". | `ShelfLifeEditor.r2-3.test.tsx`, `ShelfLifeEditor.test.tsx` (2 updated) |
| P4 "Amount in g" | `ConversionEditor` add form: one `FieldRow align="end"` with Unit (`sm`), "Amount in g" (`sm`) and the Add conversion button (secondary). | `ConversionEditor.r2-3.test.tsx` |
| F-06 Planner Style | `PlannerStyleSlider`: keep the 3-stop Slider, delete the chip row (and the `settings__stack`/`settings__row` wrapper if unused). | `PlannerStyleSlider.test.tsx` (chip tests replaced) |
| F-07 accent bar | `PreferencesForm`: replace the bare `.settings__accent-preview` bar by a labelled tile, still `data-testid="accent-preview"` + `data-accent`: overline "Preview" and a sample `Chip` "Sample" in the accent. Remove the old CSS rule. Save in `FormActions`, auto width, still disabled until a change. | `PreferencesForm.r2-3.test.tsx` |
| Settings sizing (F-01, F-03) | `HouseholdSettingsForm`: Time zone md; Planning Horizon, Default Cool-down, Default Leftover Use-by `xs` in one `FieldRow`; quiet hours start and end (`sm`) in one `FieldRow`; Location `lg`; Currency `xs`; Save in `FormActions` (Admin only; none for a plain User). Remove `.settings__row--wrap-start` usage. | `HouseholdSettingsForm.sizing.test.tsx` |
| S-02 (Products part) | `ProductList` meta and `ProductScreen` Ingredient link/subtitle show `displayName(ingredientName)` (import from `features/ingredients/lib/names`); stored data unchanged. | `ProductList.r2-3.test.tsx`, `ProductScreen.r2-3.test.tsx` |
| P4 "Pack size" | `ProductForm`: Product name `lg`, Pack size `sm` (keep label "Pack size (g)"; a `suffix` with the unit is fine), Barcode `md`, Save Product in `FormActions`. `ProductScreen` pack size tile: `sm`, "Save pack size" in `FormActions`. | `ProductForm.r2-3.test.tsx`, `ProductScreen.r2-3.test.tsx` |
| F-04 Products | `PriceEditor`: Price and Price per kg `sm` in one `FieldRow`, Save Price primary and Cancel tertiary in `FormActions`. `ProductBarcodes`: barcode `md` + "Add barcode" (secondary, `plus` icon) on one `FieldRow align="end"`. `ProductScreen` actions tile: `FormActions` with Delete Product as `destructive`, Archive/Unarchive as `secondary`. "Add Price" becomes secondary with `plus`. | `PriceEditor.r2-3.test.tsx`, `ProductScreen.r2-3.test.tsx` |
| S-04 Shop entity actions | `ShopScreen`: Rename and Delete leave the loose `.pg__row`; for an Admin the `PageHeader actions` hold `IconButton`s "Rename Shop" (`edit`) and "Delete Shop" (`delete`). `strings.renameShop` stays the sheet title; add an `renameShopLabel`. Delete keeps its confirm sheet. A plain User keeps the `adminOnly` note and no actions. A `ui/Menu` overflow can replace the two buttons later (G-01). | `ShopScreen.r2-3.test.tsx` |
| F-08 Weight rule form | `WeightRuleEditor`: Prefix `sm`; `FieldRow label="Item code"` (start, length: `xs`) and `FieldRow label="Value"` (start, length, decimal places: `xs`); Value kind and Unit selects on one row; no error text before submit and Save stays enabled; Save with an invalid rule shows the reason (`.pg__error`) and does not call `onSave`; Save rule / Cancel in `FormActions`. Keep the sample barcode field and live preview. | `WeightRuleEditor.r2-3.test.tsx`, `WeightRuleEditor.test.tsx` (1 updated) |
| Layout guard | Routes flipped to fail in `scripts/check-page-layout.modes`: `/settings`, `/settings/household`, `/settings/preferences`, `/settings/members`, `/settings/allowlist`, `/settings/shops`, `/settings/shops/:id`, `/ingredients`, `/ingredients/:id`, `/products`, `/products/:id`. The Developer must run `PAGE_LAYOUT=quick scripts/check-page-layout.sh` once and clear the findings on these routes. Meal Slots, Access requests and Notifications are not included (R15, A1, other owners). | `settings/failRoutes.test.ts` |

## Design details the tests do not pin

- Phone: `FormActions` makes the primary full width below 600 px; `FieldRow` wraps. No new breakpoints.
- Pack size and Price are stored as text in the existing hooks (`useProductForm`, `usePriceForm`); keep them. Only the field size and layout change.
- Business rules stay in hooks and `lib/`; the changes above are markup, props and CSS. `ShelfLifeEditor` may need `useShelfLifeForm` to take a `number | null` value from NumberField (conversion in the hook, not the component).
- Picture room: the Product page header and rows keep a leading slot free (`ListRow leading`, `PageHeader leading`); do not add a placeholder.
- CSS: spacing from `--space-*` tokens in every rule you touch; the old px spacing in `settings.css` and `products.css` only needs fixing where a rule is edited.

## Primitive requests (for R2-1 / `ui/**`; none block this team)

1. `Segmented` options with `icon` and per-option `describedBy`, plus a locked/read-only value row. Until then Base Unit uses `BaseUnitPicker` (same anatomy as `Segmented`); when it lands `BaseUnitPicker` becomes a thin wrapper and the `.base-unit__*` CSS goes away. The tests only pin the radiogroup contract, so they survive the swap.
2. `ui/Menu` (G-01): an overflow popover for the Shop and Ingredient entity actions. Until then S-04 uses two header IconButtons.
3. `IconButton` names used here must exist in the icon set: `edit`, `delete`, `plus`. Check `ui/icons`.

## Product and process questions

1. S-01 (avatar-menu icons for Ingredients, Products, Shops) is in the R2-3 row but lives in `app/nav.ts` and `YourMenu.tsx`, outside this team's ownership; no tests written. Assign it or add those files to this team.
2. S-03 for Planning rules and the planning-rules/RulesEditors screens (`plan/**`) are not covered (R2-2 owns `plan.css`). Shop Barcodes already use a sheet, so the Shops part of S-03 is done.
3. `scripts/check-page-layout.modes`: `modeFor` keeps only the LAST `fail_routes=` line, so "append only your own lines" cannot accumulate. This team edited the single line; the PM must merge it with other teams' routes (or make `modeFor` union the lines).
4. Shelf Life: should 0 days mean "no Shelf Life"? Chosen: min 1, blank means none (Clear removes).
5. Notifications is in the R2-3 row (`features/notifications`) but the task listed four feature folders; it is untouched (route already narrow).
