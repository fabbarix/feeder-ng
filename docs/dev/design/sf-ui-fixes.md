# SF1: four UI defects (design note for the Developer)

Beta.4 small fixes. The tests are red on purpose; this note says what makes them green. Where the note and a test disagree, the test wins and the Reviewer is told. No new component, no glossary term.

## 1. PageHeader title breaks mid-word (`web/src/ui/PageHeader.css`)
Cause: `.page-header__title { overflow-wrap: anywhere }` lets the min-content width collapse to one letter, so the flex row gives the title less than the two actions leave it and it breaks as "Pant / ry".
Fix: title `overflow-wrap: break-word` (a word breaks only if that one word cannot fit on a line of its own); `.page-header__row` gets `flex-wrap: wrap`; `.page-header__text` becomes `flex: 1 1 12rem` (keep `min-inline-size: 0`), so a title that would get less than 12rem sends the actions to a second line; `.page-header__actions` gets `margin-inline-start: auto` to stay at the inline end. Tests: `ui/PageHeader.css.test.ts`, render test in `ui/PageHeader.test.tsx` (DOM order, already green: it guards the wrap order).

## 2. "Merge into another Ingredient" spills out of its Tile (`web/src/ui/Button.css`)
Cause: `.button` is `white-space: nowrap`, `justify-content: center`, `line-height: 1` and has a fixed `block-size`. In a half-width Tile at 360 px the label is wider than the Button, and centred overflow spills equally to both sides, hence off the Tile's left edge. IngredientScreen itself is fine (`<Button variant="tertiary">` in a Tile).
Fix, in the shared Button: `max-inline-size: 100%`, drop `white-space: nowrap`, add `text-align: center` and `overflow-wrap: break-word`, `line-height` about 1.25 (token if one exists), and turn each size's `block-size` into `min-block-size` (same px) so a two-line label grows the Button. Check Gallery and the 44 px hit areas stay unchanged for one-line labels. Test: `ui/Button.label.css.test.ts`.

## 3. Shopping List line wraps "Pass / ata / 700 / g" (`web/src/features/shop/shop.css`)
Cause: it is the shop `LineTile` (Shopping List screen) in the 15rem auto-fill grid. `.line-tile__title` has `overflow-wrap: anywhere`, so in the narrow text column it breaks per letter, and `.line-tile__quantity` has no `white-space`, so "700 g" breaks at its space.
Fix: title `overflow-wrap: break-word` plus a two-line clamp (`display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden`); quantity `white-space: nowrap`. Keep `.line-tile` columns `auto minmax(0, 1fr) auto` and `.line-tile__body` `min-width: 0`. Test: `features/shop/components/LineTile.wrap.css.test.ts`.

## 4. Dialog body cannot shrink (`web/src/ui/Dialog.css`)
Cause: `.dialog__body` is a grid item (`.dialog__panel` is a grid), so its automatic minimum is the widest child. Only the ingredient exclusions list had a scoped workaround.
Fix: `min-inline-size: 0` on `.dialog__body` in Dialog.css; delete the `.dialog__body:has(> .ingredient-exclusions)` rule and its comment from `features/recipes/recipes.css`. Tests: `ui/Dialog.shrink.css.test.ts`.

## Out of scope
`ui/index.ts`, Gallery, Chip, Select, `features/settings`, GLOSSARY, CHANGELOG, the spec.
