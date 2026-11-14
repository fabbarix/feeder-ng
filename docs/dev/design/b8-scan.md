# Beta.8, team scan: To get ticks by hand, "What it is" label

Specs: `docs/design/shop-scan-proposals.md` 13.2, 13.5, 13.8 and 13.11 (updated in this change). Domain words from GLOSSARY.md.

## 1. To get ticks by hand

**What.** On the Scan screen's To get tab a row ticks the Shopping List Line; today a tap opens /shop (`ToGetList` `onOpen`).

**Decisions.**
- The whole row is the tick (one `<button>`, name "Tick Passata"); no navigation from the row. Not needed, Ticked group and
  the "How much?" sheet stay on /shop.
- The tick is the Shop screen's: `useShoppingActions().tick({ingredientId, to, quantity, shopId})`, quantity = the Line's remaining
  `ListEntry.quantity` (the "How much?" default), so it adds Stock; fresh `clientUuid` per tick (done inside the actions). The
  range `to` is `list.to` of the live Shopping List; `shopId` is the session Shop.
- "Offline-safe like the Shop screen": the Shop screen does not queue ticks, it shows the failure and changes nothing. Same here:
  a rejected tick (offline included) gives an error Toast "Couldn't tick {line}. Try again.", nothing is removed, the row is free
  to tap again. Not queued (the offline queue carries scans only). A row in flight is `pending` and ignores taps (no double tick).
- Meta line like a Scanned row: pack line, " · ", one 14 px tick and "x of y": hollow (`successOpen`, bold) while open, filled
  (`success`, fill) while the tick is in flight. "x of y" is `coverText(got, of, baseUnit, system)`: "0 of 1400 g" with no scan,
  "700 of 1400 g" after one pack (the Scanned row's `cover`; a still-queued scan does not count). Same icon names and the
  `scanned-row__tick` / `scanned-row__cover` classes as `ScannedRow`'s MetaLine: extract that MetaLine part into a small shared
  component (`CoverMeta`) used by both, rather than copying markup.
- Success: Toast `"{line} ticked"` + Undo (`actionLabel` "Undo"); Undo = `untick(ingredientId, to)`; an Undo that fails says
  "Couldn't undo that tick. Try again." (error). The Line leaves To get when the list refreshes (`toGetLines` drops ticked Lines).
- Empty: `EmptyState` "Nothing left to get" / "Every Line on the Shopping List is ticked." instead of an empty list.

**Files** (all in `web/src/features/scan/`).
- `lib/toGet.ts` (new, no React): `toGetRows(lines, scannedRows, currency, system): ToGetRow[]` with
  `ToGetRow = { entry: ListEntry; cover: { text: string; done: boolean } }`; `tickRequest(entry): { ingredientId; quantity } | null`.
- `hooks/useToGetTick.ts` (new): `useToGetTick({ to: string | undefined, shopId: number | null }) => { tick(entry): Promise<void>; pendingKeys: ReadonlySet<string> }`.
  Uses `useShoppingActions` and `useToast`. Does nothing with no `to` or no Ingredient.
- `hooks/useScanController.ts`: calls it, returns `toGetTick` on `ScanController` (`to: shopList.data?.to`, `shopId` of the Shop).
- `components/ToGetList.tsx`: props become `{ rows: ToGetRow[]; pendingKeys: ReadonlySet<string>; onTick(entry: ListEntry): void }`;
  a `ListRow` per Line with `onActivate = tick` (disabled while pending, via ListRow's new `busy` prop), `aria-label`
  `scanStrings.tickLine(title)`, Thumb 48, shop `rowValue` column, `meta` = pack line + cover. Empty state as above.
  Review: `ListRow` gains `busy?: boolean` (like `Button`'s `loading`): the `li` is `aria-busy` and the target stays, disabled,
  so focus and tab order are kept while the tick is in flight; the row shows the filled tick.
- `components/ScannedRow.tsx`: only to move MetaLine's cover part into the shared `CoverMeta`.
- `screens/ScanScreen.tsx`: only the `ToGetList` line: `rows={toGetRows(scanned.toGet, scanned.rows, c.currency, c.system)}`,
  `pendingKeys={c.toGetTick.pendingKeys}`, `onTick={(e) => void c.toGetTick.tick(e)}`; drop `navigate('/shop')` if nothing else
  uses it (`useNavigate` may stay if used elsewhere). Nothing near the "Read the receipt" footer is touched.
- `strings.ts`: `tickLine`, `lineTicked`, `undoAction`, `tickFailed`, `untickFailed`, `nothingToGet`, `nothingToGetHint`.
- `scan.css`: the busy row (`[aria-busy=true]`: muted target, no hover), if needed.

**Tests (written first, failing).**
- `lib/toGet.test.ts`, `strings.toGet.test.ts`, `hooks/useToGetTick.test.tsx`, `components/ToGetList.test.tsx` (includes the a11y
  group), `screens/ScanScreen.toGet.test.tsx`, one test in `hooks/useScanController.test.tsx`; `screens/scanScreen.testKit.tsx`
  gets `toGetTick` on `controllerFake`.
- BDD `bdd/features/scan/tick_by_hand.feature` pins the API contract the row uses (tick by hand covers a Line and adds Stock, a
  scanned half then a hand tick, untick puts it back). It runs on existing steps and already passes; the UI behaviour is in the
  vitest files above.
- `ScanScreen.split.test.tsx` "To get shows the open Lines" still holds (`/Passata/` matches "Tick Passata").

## 2. "What it is" label on the new-Product sheet

**Finding.** The sheet already draws "What it is", but as the `Segmented`'s small field label (meta size) in a `.ui-field`, unlike
"Which Line is it?" and "Pack size" (`.new-product__label`, body-strong); the control is a segmented radio, not picture chips.

**Decision** (user): label yes; picture chips instead of a radio. So `NewProductKind` drops the `Segmented` for a labelled chip pair:
`<p id class="new-product__label">What it is</p>` then `<div role="radiogroup" aria-labelledby={id} class="new-product__chips">` of two
`<button type="button" role="radio" aria-checked class="choice-chip">` (Ingredient, Supply) each with a Phosphor icon (`ingredients`,
`supply`), roving tabindex (`useRovingRadios` from `ui/fields`) and Arrow keys. Add the radio role through a new optional prop on
`ChoiceChip` only if it is small and backward compatible (`role?: 'radio'`, `checked`); otherwise a local `KindChip` in
`components/` that reuses the `choice-chip` classes. The `Select` below and the near-duplicate guard are unchanged; the existing
`kindGroup()` helper (`radiogroup` named "What it is") keeps working.

**Files.** `components/NewProductKind.tsx`, optionally `ui/ChoiceChip.tsx` (+ its test) or a new `components/KindChips.tsx`,
`NewProductSheet.css` if needed. **Tests.** `components/NewProductSheet.kindLabel.test.tsx` (label visible and styled like its
siblings, `aria-labelledby` the label, Choice chips with icons, no `input[type=radio]` or `.segmented`, roving tabindex and arrows).
Two of its eight tests fail today; the rest pin behaviour that must not regress.

## Copy
"Tick {line}", "{line} ticked", "Undo", "Couldn't tick {line}. Try again.", "Couldn't undo that tick. Try again.", "Nothing left to
get", "Every Line on the Shopping List is ticked.", "What it is".
