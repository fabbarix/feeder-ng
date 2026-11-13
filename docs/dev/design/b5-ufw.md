# b5-ufw: Used from in the Mark as Cooked sheets (web)

Sources: beta5-plan §2.6 (Used from), beta5-reconcile §6.2 point 5, §9, §12 (UF-web), ADR 0011, GLOSSARY **Used from**.
Scope: the web client only. No backend exists yet, so the client types follow the plan/reconcile API text exactly.

## 1. Behaviour

Both the Mark as Cooked sheet and the Mark all Cooked sheet (one section per Course) get a collapsed row **Used from**.

- Collapsed summary: "Soonest to go off first" (no pick) or "Your choice for N Ingredient(s)".
- Expanded: one block per needed Ingredient ("Chicken thighs · 800 g") listing its Stock Lots in Deduction order (the order the cook preview sends: soonest go-off, then oldest bought, then lowest id), each with its Storage Place, quantity and dates. Each Lot is a shared `Checkbox`; a ticked Lot also shows a shared `NumberField` for the amount used.
- Ticking prefills the amount in pick order up to the need: `min(lot quantity, need - amounts already picked)`. When the need is already covered, the prefill is the whole Lot (the cook used more). The User may change it (0 to the Lot's quantity). Unticking removes the pick.
- Short pick (picked < need): the line says the rest follows the default order. Over pick: "taken as chosen". Neither blocks.
- An Ingredient with no Lots: "No Stock of this Ingredient" (no checkboxes); Cooked still goes ahead (never blocks).
- Mark all Cooked: picks are per Course. Two Courses may take the same Lot; if their picks together exceed what the Lot holds, the section shows an error under the Ingredient line and Mark all Cooked is disabled (all or nothing; reconcile §6.2.5). The server re-validates; a `422 used_from_invalid` makes the sheet show "Some Stock Lots changed. Check Used from and try again." and reload the previews (new Lots).
- Default (no picks anywhere): the cooked request carries no `usedFrom`, so behaviour is exactly as today.

## 2. Client types (exactly as the plan/reconcile state)

```ts
// preview: GET .../{courseId}/cook, each need gains lots in Deduction order (reconcile §6 API)
interface UsedFromLot { id: number; quantity: number; purchased: string; goesOff: string | null; storagePlaceName: string }
interface UsedFromNeed { ingredientId: number; ingredient: string; quantity: number; baseUnit: 'g'|'ml'|'piece'; lots: UsedFromLot[] }
// request: POST .../{courseId}/cooked and each courses[i] of .../all/cooked
interface UsedFromPick { lotId: number; quantity: number }
interface UsedFromEntry { ingredientId: number; lots: UsedFromPick[] }
```

`CookPreview.needs` in `types.ts` is owned by b5-f1; we do not edit it. `api.usedFrom.ts` exports `CookPreviewWithLots` (a `CookPreview` whose `needs` are `UsedFromNeed[]`) and `CookedAllEntryWithUsedFrom` (`CookedAllEntry & { usedFrom?: UsedFromEntry[] }`). At wiring time these fold into `types.ts`.

## 3. Modules

| File | Role |
|---|---|
| `lib/usedFrom.ts` | Pure: `Selection`, `togglePick`, `setPickAmount`, `pickedTotal`, `lineState` (none/short/exact/over), `usedFromSummary`, `toUsedFrom` (payload; undefined when empty), `overPickedLots` (cross-Course), `usedFromLines(needs, selection, unitSystem, today)` (view models; `LotView` carries `unit`, the Base Unit). Totals compare with a small epsilon. `setPickAmount(..., null)` clears the pick. `LotConflict` also carries `purchased` and `baseUnit`. |
| `components/usedFrom.css` | Token-based rules (no literal colours) for `.used-from`, `__panel`, `__line`, `__lot`, `__message`, `__conflict`; imported by the section. |
| `usedFromStrings.ts` | All copy (below). |
| `api.usedFrom.ts` | `usedFromApi.cooked(key, {leftoverPortions?, usedFrom?})`, `usedFromApi.cookedAll(slot, entries)`, `isUsedFromInvalid(err)`. Same routes as `planApi`; adds `usedFrom` to the bodies only when non-empty. |
| `hooks/useUsedFrom.ts` | `useUsedFrom(courses)`, `courses: { courseId; courseName; needs }[]` (one entry for Mark as Cooked). `useUsedFrom(courses, { unitSystem, today })`. Holds the Selections per Course, resets when the needs change, exposes `lines(courseId)`, `summary(courseId)`, `toggle`, `setAmount(..., amount | null)` (null clears the pick), `entries(courseId)`, `conflicts`, `hasConflict`, `conflictMessages` (a record keyed by `lotId`), and per-Course expansion `expanded(courseId)` / `toggleExpanded(courseId)`. |
| `components/UsedFromSection.tsx` | Renders the collapsed row (shared `ListRow` disclosure) and its panel from the view models; no logic. `conflicts` is `{ lotId, message }[]`, shown outside the Lot row (accepted). `onAmount` receives `null` when the field is cleared. |

## 4. Copy (GLOSSARY words: Stock Lot, Storage Place, Ingredient, Course, Deduction; never "source lots", "picked lots")

| Key | Text |
|---|---|
| title | Used from |
| summary default | Soonest to go off first |
| summary chosen | Your choice for 1 Ingredient / Your choice for N Ingredients |
| line title | `<Ingredient> · <need>` e.g. "Chicken thighs · 800 g" |
| Lot label | `<quantity> · <Storage Place>` e.g. "500 g · Fridge" |
| Lot meta | The go-off wording of the Stock screen, `describeGoOff(...)` from `features/stock/lib` (reused, `today` passed in): `Good until 14 Nov` / `Good until tomorrow` / `Went off 3 days ago` / `No go-off date`; plus ` · Bought 9 Nov`. A gone-off Lot never reads "Good until <past>". |
| No Storage Place | A Lot with `storagePlaceName` `""` reads `Not sorted` in the Lot label, the amount label and the conflict message. |
| amount field label | `Amount used from <Storage Place>`; the NumberField shows the Base Unit (`unit`: g, ml, piece) as its suffix |
| short | `<picked> of <need> chosen. The rest follows soonest to go off first.` |
| over | `<picked> chosen, more than the <need> needed. Taken as chosen.` |
| no Lots | No Stock of this Ingredient |
| conflict | `<Ingredient>: the Courses together take more from the <quantity> Lot in <Storage Place> than it holds`; names the Lot (its quantity, and the Bought date when needed) so two Lots in one place are distinct |
| server refusal | Some Stock Lots changed. Check Used from and try again. |

## 5. Wiring plan (developer step, after b5-f1 merges)

1. `types.ts`: replace `CookPreview.needs` by `UsedFromNeed[]`; add `usedFrom?` to `CookedAllEntry`; delete the temporary aliases in `api.usedFrom.ts`.
2. `api.ts`: `cooked(key, leftoverPortions, usedFrom?)` and `cookedAll` pass `usedFrom` (or call `usedFromApi`).
3. `useMarkCooked`: `const uf = useUsedFrom([{ courseId, courseName, needs: preview.needs }])`; `confirm` sends `uf.entries(courseId)`; on `isUsedFromInvalid` set the error to `usedFromStrings.refused`, invalidate the preview query.
4. `useMarkAllCooked`: one `useUsedFrom` over all previews; each `courses[i]` carries its `usedFrom`; the confirm is disabled while `hasConflict`.
5. `MarkCookedSheet` / `MarkAllCookedSheet`: render `<UsedFromSection>` below the Leftover stepper (per Course section in Mark all Cooked); props flow from the hook through `CookFlowSheets` / `AllCookedSheets`.
6. Replace the `needs: []` fixtures in the existing sheet tests if the type change needs it; add a CHANGELOG entry.

## 6. Open questions

- Preview `needs[].baseUnit` is not named in the plan; we require it (no default unit). PM to confirm with the UF-runner/httpapi team that the server sends it. The Unit System (metric/imperial) comes from the Household setting at wiring time (default metric here).
- Confirmed by the PM: when the need is already covered, the prefill of a further ticked Lot is its whole quantity.
- The request item is `{ ingredientId, lots: [{ lotId, quantity }] }`, as the plan says (not `picks`).
