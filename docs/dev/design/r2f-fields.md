# R2-F: field sizes, FieldRow, FormActions, one focus ring

Source: `docs/design/ui-review-2.md` (F-01, F-03, F-04, F-05/F-09 ring and Segmented, G-02, K1 follow-ups (b) to (d)) and the R2-F row of the work-package table. Tests are written first and are red. Production code in this commit is type-only: the `size`, `block` and `Stepper size` props are declared, `FieldRow` and `FormActions` are bare stubs (`<div />`), and `TextField`/`SearchField` destructure `size` so it cannot reach the `<input>`. No screen is migrated.

## 1. Field size (F-01)

`type FieldSize = 'xs' | 'sm' | 'md' | 'lg' | 'full'` and `FieldSizeProps { size?: FieldSize }` in `ui/fields/Field.ts`.

Tokens, defined once in `Field.css` `:root` (or `styles.css`):

| Token | Value | Use |
|---|---|---|
| `--field-size-xs` | 112px | 1 to 2 digits |
| `--field-size-sm` | 168px | up to 4 digits plus a unit; a time |
| `--field-size-md` | 320px | a name, a time zone, an email, a date |
| `--field-size-lg` | 480px | a long line (URL) |
| `--field-size-xs-stepper` | 136px | `xs` NumberField with its stepper |

Rendering: `FieldFrame` takes `size` and writes `data-size` on the outer `.ui-field` (no attribute when `size` is undefined, so `FieldFrame` alone keeps its container width). CSS:

- `.ui-field { inline-size: 100%; min-inline-size: 0 }`, and `.ui-field[data-size='xs'|'sm'|'md'|'lg'] { max-inline-size: var(--field-size-*) }`, `full` is `100%`. Never a fixed `inline-size`: the frame is its container's width up to the cap, left-aligned.
- `SearchField`'s root `.search-field` carries the same `data-size` and the same rules (same tokens).
- `.ui-field--stepper[data-size='xs'] { max-inline-size: var(--field-size-xs-stepper) }`.

Defaults (the primitive passes them to `FieldFrame`):

| Primitive | Default |
|---|---|
| TextField, Select, DateField | `md` |
| NumberField, TimeField | `sm` |
| TextArea, SearchField | `full` |

`size` is destructured by every primitive, so `<input size>` never appears. `Select` takes it through `SelectFieldProps`; `MultiSelect` and the domain selects inherit it.

### Compact NumberField and Stepper
- `NumberField` with a stepper (not `hideStepper`) puts `ui-field--stepper` on its frame; the control is `[-] 7 [+]` with 40 px buttons (`.ui-field--stepper .icon-button`), the value centred and tabular, the unit inside. At `xs` the frame is 136 px.
- `Stepper` gets `size?: 'md' | 'sm'` (default `md`), written as `data-size` on `.stepper`; `sm` is the compact variant (gap `--space-1`, value `title-3`), inline-flex, never stretched. `StepperField` is unchanged.

### FieldRow (`ui/fields/FieldRow.tsx`, `FieldRow.css`)
`<FieldRow label? align?>children</FieldRow>`. `div.field-row`: `display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-start`. Children `.field-row > * { flex: 1 1 var(--field-size-xs); min-inline-size: 0 }`: each field starts from the xs width, grows up to its own `max-inline-size` and wraps when the row is full, so no media query is needed (three xs fields wrap 2 + 1 on a 360 px phone). `label` makes it `role="group"` with that name; `align="end"` sets `data-align="end"` (`align-items: flex-end`, for a trailing Button).

## 2. Buttons: `block` and FormActions (F-03, F-04)

`Button block?: 'phone' | 'always' | 'never'`, written as `data-block` (not set for `never`).
- `[data-block='always']`: `inline-size: 100%`; `[data-block='phone']`: `inline-size: 100%` in `@media (max-width: 599px)`.
- **Deviation from the review: the default is `never`, not `phone`.** A `phone` default would stretch every Button on phones (tile buttons, header actions, inline "Open Settings") in screens this package does not migrate. Forms get the phone behaviour from `FormActions`' own CSS. If the PM wants the review's default, it is a one-line change to the default and the "sets no data-block by default" test.

`FormActions` (`ui/FormActions.tsx`, `FormActions.css`): props `primary` (required), `secondary?`, `tertiary?`, `destructive?` (ReactNode, normally Buttons). DOM order is destructive, tertiary, secondary, primary (primary last, the reading and tab order on desktop); each slot is wrapped in `.form-actions__<slot>`.
- Base (phone first): `.form-actions { display: flex; inline-size: 100%; gap: var(--space-2) }`; `@media (max-width: 599px)`: `flex-direction: column-reverse`, `.form-actions .button { inline-size: 100% }` so the primary is on top, full width, and the destructive action is last.
- `@media (min-width: 600px)`: one row, `justify-content: flex-end`, `.form-actions__destructive { margin-inline-end: auto }` (far left), no full-width button (primary is never full width on desktop).
- `inline-size: 100%` lets it fill the `.sheet__footer` and `.dialog__actions` it sits in; those two keep their own flex rules so a legacy footer with bare Buttons is unchanged. Pages use it directly. The sticky bar (R2-L `StickyActionBar`) will wrap it.

## 3. One focus ring (F-09, K1 (b))

`styles.css`: `--focus-ring: 0 0 0 2px var(--color-accent);` once, in the static tokens `:root` (the ring colour follows the scheme through `--color-accent`).

On focus a field control gets `border-color: var(--color-accent); box-shadow: var(--focus-ring)` and **no outline**: the border change and the ring are one accent line, not a dark border with a pale halo. Selectors:

| Control | Selector | Trigger |
|---|---|---|
| TextField, NumberField, TextArea, StepperField control | `.ui-field__control:focus-within` | focus-within |
| SearchField | `.search-field__control:focus-within` | focus-within |
| Select | `.select__trigger:focus-visible` | keyboard |
| DateField | `.date-field__trigger:focus-visible` | keyboard |
| TimeField | `.time-field:focus-within` (new) | focus-within |
| Stepper value | `.stepper__value:focus-visible` | keyboard |

Inner inputs keep `outline: none`. The TimeField segment's focus is a soft fill only (`background: var(--color-soft)`, no outline, no shadow). An invalid field keeps `border-color: var(--status-danger-fg)` while focused. The 3 px `--color-soft-strong` halo is removed from `Field.css` and `SearchField.css`. Not changed (out of the review's list): `Button` and `IconButton` (their hover overlay is also a `box-shadow`), Segmented options, calendar day buttons, which keep their 3 px accent outline.

### Contrast (WCAG 1.4.11, ring `--color-accent` against what it touches; computed by `theme/contrast.ts` in `focusRing.css.test.ts`)

| Scheme | accent | vs surface (sheet) | vs surface-2 (control fill) | vs surface-3 | vs bg |
|---|---|---|---|---|---|
| light | #34724e | 5.67 | 4.65 | 4.10 | 5.06 |
| dark | #89c8a0 | 8.99 | 7.69 | 6.47 | 9.99 |

All at least 3:1. The test reads both token sets from `styles.css`, so a palette change re-checks it.

## 4. Smaller items
- **TimeField** (K1 (c), (d)): `size` default `sm`; `.time-field` drops `inline-size: 100%` (the frame caps it); disabled is `color: var(--color-muted)` on the group, segments, filled segments and label, with no `opacity`.
- **Same defect, extended scope:** `.select__trigger:disabled`, `.date-field__trigger:disabled` and `.segmented[data-disabled]` / `.segmented__option:disabled` also dim with `opacity: .38`; they move to muted colours too (tests included). Drop those tests if the PM prefers to keep this out of R2-F.
- **Fieldset reset / Segmented label** (F-05, F-09): `Segmented` already is a `radiogroup` with a visible label (a test pins it). `Field.css` gets `fieldset.ui-field { border: 0; padding: 0; margin: 0; min-inline-size: 0 }` and `legend.ui-field__label { padding: 0; margin-block-end: var(--space-1) }` so a screen that keeps a native `<fieldset><legend>` loses the browser frame; removing the frame in `IngredientScreen.tsx` and the duplicate "g"/"3 days" is R2-3 (F-05).
- **Sheet handle** (G-02): `.sheet__grip { display: none }` and `.sheet__panel { padding-block-start: var(--space-5) }` in the `min-width: 768px` block of `BottomSheet.css`.
- **Gallery:** new groups "Field sizes" (a TextField at each size, an `xs` stepper NumberField, a compact Stepper, a Select, a DateField, a TimeField `sm`, a SearchField, a field in `data-gallery-focus` showing the ring statically), "FieldRow" (Yield, Cool-down, Leftover Use-by as `xs` NumberFields), "FormActions" (all four slots, with a `block="always"` Button and a disabled TimeField in the sizes group), in both schemes.
- **Barrel:** `ui/index.ts` exports `FieldRow`, `FormActions` and their prop types, plus `FieldSize`. (`index.ts` is shared with R15 and R2-L: the PM serialises the commit.)

## 5. Files

New: `ui/fields/FieldRow.tsx`, `FieldRow.css`, `ui/FormActions.tsx`, `FormActions.css`.
Changed (Developer step): `styles.css` (`--focus-ring`), `ui/fields/Field.ts`, `FieldFrame.tsx`, `Field.css`, `TextField.tsx`, `TextArea.tsx`, `NumberField.tsx`, `DateField.tsx`, `DateField.css`, `TimeField.tsx`, `TimeField.css`, `SearchField.tsx`, `SearchField.css`, `Segmented.css`, `ui/Select/Select.tsx`, `Select.css`, `ui/Stepper.tsx`, `Stepper.css`, `ui/Button.tsx`, `Button.css`, `ui/BottomSheet.css`, `ui/index.ts`, `ui/Gallery.tsx` (and `Gallery.css` if needed), `scripts/check-ui.allow-classnames` only if the class-hooks guard flags a new class.
Already changed in this commit (types only): `Field.ts`, `FieldFrame.tsx`, `TextField.tsx` (destructures `size`), `TextArea.tsx`, `NumberField.tsx`, `DateField.tsx`, `TimeField.tsx`, `SearchField.tsx`, `Select.tsx`, `Button.tsx`, `Stepper.tsx`, plus the stubs `FieldRow.tsx`, `FormActions.tsx`.

## 6. Tests (all new, all red, in `web/src/ui`)

| File | Covers |
|---|---|
| `fields/fieldSize.test.tsx` | `data-size` for 5 sizes on FieldFrame, TextField, TextArea, NumberField, Select, DateField, TimeField, SearchField; the defaults; no `<input size>` |
| `fields/fieldSize.css.test.ts` | the five tokens, the `data-size` rules, `.ui-field` 100 % + min 0, stepper xs, SearchField rules |
| `fields/compactStepper.test.tsx` | `ui-field--stepper`, 40 px buttons, `Stepper size="sm"`, Stepper value ring |
| `fields/FieldRow.test.tsx` | children, group label, `align`, wrap CSS (flex basis token, no media query) |
| `FormActions.test.tsx` | DOM order, slots, in BottomSheet footer and Dialog actions, phone/desktop CSS |
| `Button.block.test.tsx` | `data-block`, `always`/`phone` CSS (the defaults test and the unknown-attribute test pass today) |
| `fields/focusRing.css.test.ts` | the token, one assertion per control (same token, no second outline, no soft-strong), segment soft fill, contrast >= 3 for the four surfaces in light and dark (the contrast cases already pass: they pin the palette) |
| `fields/timeFieldDisabled.css.test.ts` | TimeField muted; Select and DateField triggers muted |
| `fields/timeFieldSize.test.tsx` | TimeField `sm` default, no forced 100 % |
| `fields/fieldset.css.test.tsx` | fieldset/legend reset, Segmented label (passes), Segmented disabled colours |
| `BottomSheet.handle.test.ts` | handle hidden from 768 px (the phone-handle case passes) |
| `Gallery.fields.test.tsx` | the three groups, every size, stepper, FieldRow, FormActions slots, block Button, disabled TimeField, static focus |
| `fields/exports.test.ts` | barrel exports (the second case passes) |
