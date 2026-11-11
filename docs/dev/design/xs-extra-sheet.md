# XS: floating popovers and the Add to Shopping List sheet

Report: "The add to shopping list dialog is broken and ugly." Two problems, one cause each.

## 1. Broken: the Ingredient list is clipped

### Root cause
`ui/Select` draws its list as `.select__popover { position: absolute; z-index: 25 }` inside the field's `.select` box. From 768 px the
`BottomSheet` is a centred dialog: `.sheet { overflow: hidden }` and `.sheet__body { overflow-y: auto }`. An absolutely positioned
descendant is clipped by both, and `z-index` cannot lift it out of the dialog's stacking context. With a short form (two fields) the
popover starts below the last field, so only its Search box (the first ~60 px) shows before the dialog's bottom edge cuts it off. Below
768 px Select opens its own BottomSheet, so phones are fine.

`ui/fields/DateField` has the same bug (`.date-field__popover` is `position: absolute`): the "Bought on" calendar in AddLotSheet is clipped
the same way. The same applies to any future Select or DateField in a sheet or dialog.

### Options
| Option | Verdict |
|---|---|
| Let the dialog grow to hold the list | No. Dialogs would jump in height, tall lists exceed the 85dvh cap, and a `position: absolute` child still sits inside `.sheet__body`'s overflow. |
| Portal to `document.body` with `position: fixed` | No. A modal `<dialog>` is in the top layer, which paints above everything in the normal layer whatever the z-index, so a body-level popover would sit **behind** the dialog (Menu has this flaw; it is only used on pages). |
| Open the list as a sheet at every width | Works, but a sheet on top of a dialog is heavy for a 3-item list and changes the desktop UX. |
| **Popover API (`popover="manual"`) + `position: fixed` placed from the trigger** | **Chosen.** The element joins the top layer, so it paints above its dialog (it is a DOM descendant of the dialog, so the modal's inertness does not apply), is never clipped by an ancestor's overflow, needs no z-index and no portal. Focus, `aria-controls`, outside-click and Escape keep working because the DOM position is unchanged. |

### Design
- `ui/lib/placePopover.ts` (pure, tested): `placePopover({ anchor, size, viewport, gap = 4, margin = 8 }) => { top, left, maxHeight, placement }`.
  Below the anchor when it fits, or when below has at least as much room as above; otherwise above. `maxHeight` is the room on the chosen
  side. `left` aligns to the anchor's left edge, clamped to `[margin, viewport.width - width - margin]`.
- `ui/lib/useFloatingPopover.ts` (hook): given `open`, the anchor ref and the popover ref, it calls `showPopover()` when it exists (feature
  test, so jsdom and old browsers still render, with `position: fixed` alone), measures in a layout effect, writes `position: fixed`,
  `top`, `left`, `maxHeight` inline, re-places on `scroll` (capture) and `resize`, and calls `hidePopover()` on close/unmount.
- `Select.tsx`: `<div className="select__popover" popover="manual" ref=...>`; `.select__list` becomes the scrolling part so the whole
  popover respects `maxHeight` (`display: flex; flex-direction: column; max-block-size` from the inline `maxHeight`, list `flex: 1; min-block-size: 0`).
- `DateField.tsx`: the same for `.date-field__popover` (`popover="manual"`).
- CSS: `.select__popover` and `.date-field__popover` become `position: fixed; margin: 0; inset: auto; overflow: visible` (resets the UA
  `[popover]` box) and drop `z-index` and the `inset-*` lines. `max-inline-size: calc(100vw - 16px)` stays.
- Escape inside the Select list closes the list only: the Select already `preventDefault`s Escape, and the dialog's `cancel` event is not
  fired for a handled key. The regression test covers it.
- Do not touch `ui/index.ts`, `icons.ts`, `Gallery.tsx` or `Select/CourseSelect.tsx` (team D1).

### Every Select inside a sheet or dialog
All go through the shared `Select`/`DateField`, so the fix covers them: ExtraSheet (Ingredient), AddLotSheet (Ingredient, Storage Place,
Bought on), NewIngredientSheet, UnknownBarcodeSheet, AddShopBarcodeSheet, ApproveSheet, MemberEditor, LotSheet/Move to, StoragePlaceSheet,
MealSlot editor, DateAttendancePanel, TickSheet (no Select, only NumberField). The regression test exercises the shared primitive plus
ExtraSheet, AddLotSheet (both Selects) and a DateField in a sheet. The implementer should open each of the sheets above once in a
real browser at 768 and 1280 px.

## 2. Ugly and unclear

### What the spec already says
Spec §9: "Manual extras: a free-text line (e.g. "toilet paper"), or an Ingredient with a quantity." The model, the API
(`POST /api/shopping/extras` with `{ text }` or `{ ingredientId, quantity }`, `internal/shopping/httpapi`) and `ExtraInput`
already support both. The current sheet already has a Quantity, but it only appears after an Ingredient is picked, so a user never sees it.
**No spec change and no backend change are needed.** (The sheet also let you fill both text and Ingredient, then refused with "Choose
text or an Ingredient, not both"; the new design makes that state impossible.)

### Problems found
1. Fields use the default `size="md"` (max 320 px) inside a 560 px dialog: half width, empty right side. Fix: `size="full"` on every field.
2. Save sits alone in the body (`FormActions` inside the form). Fix: the sheet's `footer` slot, like AddLotSheet.
3. Two optional-looking fields with no explanation. Fix: one explicit choice (below).
4. Quantity hidden until an Ingredient is picked. Fix: shown (disabled) from the start in Ingredient mode.

### Layout
Title: **Add to Shopping List**. Body (one column, all fields full width, 12 px gap, scrolls on a short phone):

```
What are you adding?                       (Segmented, radiogroup, full width)
[ Ingredient ] [ Something else ]
An Ingredient is added to Stock when you tick it. Anything else is just a reminder.   (helper)

-- Ingredient (default) --               -- Something else --
Ingredient                               Something to buy
[ Choose an Ingredient             v ]   [ e.g. toilet paper              ]
Quantity
[ - ]  [ 0          ] ml  [ + ]          (no other field)
(disabled until an Ingredient is chosen; unit = its Base Unit)

-------------------------------- sticky footer ---
                          Cancel   [ Save ]        (FormActions: tertiary + primary)
```

- One choice, not two optional fields. Default is **Ingredient** (it feeds Stock and Cost); when there are no Ingredients to pick the
  default is Something else and the Ingredient option is disabled.
- Phone (< 600 px): FormActions stacks, Save on top, full width; the body scrolls under the sticky footer; the Ingredient select opens
  as its own sheet (unchanged). iPad / desktop (>= 768 px): centred 560 px dialog, the Ingredient list floats above it (section 1).
  Cancel and Save sit right-aligned from 600 px.
- Bento: no new tile; it is a form sheet like AddLotSheet. Segmented, Select, NumberField, TextField, FormActions are existing shared
  primitives. No native select, no new icons.
- Mode switch keeps what was typed in the other mode in state but never sends it; it clears any error.
- The sheet resets on every open (AddLotSheet convention).

### Component and logic changes
- `lib/extraDraft.ts`: `checkExtraDraft({ mode: 'ingredient' | 'note', text, ingredientId, quantityText })` returns
  `{ ok: true, input } | { ok: false, field: 'text' | 'ingredient' | 'quantity', error: 'required' | 'chooseIngredient' | 'mustBePositive' }`.
  `bothFilled` is removed (and `shopStrings.pickOneNotBoth`).
- `shopStrings`: add `extraKind: 'What are you adding?'`, `extraKindIngredient: 'Ingredient'`, `extraKindNote: 'Something else'`,
  `extraKindHelper: 'An Ingredient is added to Stock when you tick it. Anything else is just a reminder.'`,
  `chooseIngredient: 'Choose an Ingredient'`, `cancel` (reuse the shared one if a ui string exists). `extraText` stays 'Something to buy'.
- `ExtraSheet.tsx`: `BottomSheet footer={<FormActions tertiary={Cancel} primary={<Button type="submit" form={formId}>Save</Button>} />}`;
  the form has `id={useId()}`, still `className="shop-sheet-form"`; mode state; errors per field (`error` prop on the Select,
  NumberField, TextField). No logic in the component beyond wiring.
- `ShoppingScreen.tsx` is unchanged (same props).
- Existing `Shop.lead.formActions.test.tsx` ("Save is the primary of a FormActions row") stays valid.

### Backend and spec impact
None. Spec §9 already describes both kinds of extra; the API and store already accept `{ text }` or `{ ingredientId, quantity }`.

## Red tests (this commit)
- `web/src/ui/lib/placePopover.test.ts`: placement maths.
- `web/src/ui/popover-css.test.ts`: Select and DateField popovers are `position: fixed`, reset the UA popover box.
- `web/src/ui/Select/Select.inDialog.test.tsx`: the Select-in-dialog regression (popover="manual", showPopover/hidePopover, placement, flip,
  Escape keeps the dialog), ExtraSheet and AddLotSheet Selects, DateField in a sheet.
- `web/src/features/shop/lib/extraDraft.test.ts`: mode-based checking.
- `web/src/features/shop/components/ExtraSheet.test.tsx` (rewritten) and `ExtraSheet.layout.test.tsx`: modes, validation per field, footer
  actions, full-width fields, reset on reopen.
