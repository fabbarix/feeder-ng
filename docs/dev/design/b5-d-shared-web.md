# Beta.5 WP D: shared web

Owner files: `web/src/ui/icons.ts`, `ListRow*`, `Gallery*`, `galleryData.ts`, `index.ts`. Runs before ST and LOW.

## Glyphs (`ui/icons.ts`)
New registry keys: `snowflake` (Snowflake), `question` (Question), `shoppingCart` (ShoppingCart), `guests` (UserPlus).
Only ShoppingCart is a new Phosphor module; the others reuse modules already imported (`freezer`, `unknownBarcode`, `allowlist`).
Guests uses `UserPlus` (a guest is someone added to the table), not `UsersThree`, so it differs from Members and Attendance.
Budget: measured with the four keys, 107 modules, **45,650 B gzipped** (was 45,209 B; budget 46,080 B), 430 B headroom. Within budget, so no PM decision needed.
`MIN_MODULES` goes 106 to 107 (red until the import lands); `wp2-icons.md` has the four rows.

## Expandable `ListRow`
Props: `expanded: boolean`, `onToggle: () => void`, optional `panel: ReactNode` (an addition to the reconcile row: `children` stays the always-visible extra content under the meta line). The row is controlled; it keeps no state.
- With `onToggle` the whole-row target is a `<button class="list-row__target">` with `aria-expanded`, `aria-controls` = a per-row `useId` panel id. Enter and Space work natively.
- `panel` renders inside the `li` as `<div id class="list-row__panel" hidden={!expanded}>`, always in the DOM so `aria-controls` resolves. It sits after the header content (`flex-basis: 100%`, `li` wraps), outside the button, and catches the pointer (the rest of the row content is click-through).
- `data-expanded="true"` on the `li` when expanded; `data-height="auto"` when expanded (collapsed keeps 56/64/72). The chevron, if shown, rotates 90deg when `data-expanded`.
- Types: `onToggle` excludes `href` and `onActivate`, requires `expanded`, and a ReactNode title needs `aria-label` (same rule as other targets).
- Trailing IconButtons keep working on their own and do not toggle.

## Gallery
ListRow section gains a cell "beta.5 glyphs" (rows titled Snowflake, Question, Shopping cart, Guests with those icons) and a cell "expandable" (a collapsed and an expanded stateful row). Export nothing new from `index.ts` (ListRow types already exported).

## Tests (red)
`ListRow.expand.test.tsx`, `icons.beta5.test.tsx`, `Gallery.beta5.test.tsx`, `scripts/test/icons-bundle_test.sh` (MIN_MODULES).
