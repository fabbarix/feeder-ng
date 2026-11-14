# Undo of a tick takes back the Stock it added

Status: **Accepted** (2026-11-13; the user's decision for beta.8, [b8-undo.md](../dev/design/b8-undo.md)). Extends [ADR 0013](0013-bought-planned-meals-held.md) point 1 (what a purchase leaves behind) to a Tick by hand, and supersedes the behaviour written as "the Lot it added stays" in `shopping.Service.Untick` (a code comment and [b5-bo.md](../dev/design/b5-bo.md) row 13, never an ADR).

A Tick by hand adds a Stock Lot, as a Scan in Shop mode does. Undo of a Scan removes its Lot; unticking left the Lot, so on the Scan screen's To get tab "tick, Undo" put the Line back to get but kept the Stock. Three cycles left 14 kg of Cauliflower, and the next list counted it as bought.

## Decision

1. **Untick takes back the Stock the tick added.** On the server, so the Shop screen's untick and the To get toast's Undo (the same call) behave alike. The tick records the Lot it added and the quantity it added (`shopping_ticks.lot_id`, `lot_quantity`; an Ingredient extra's tick records the same on the extra).
2. **What is taken back.** What is left of that Lot, never more than the tick added, and never another Lot. Untouched: the Lot goes. Partly used (Cooked, Used from, a Use): what is left goes, because the food that was used was eaten and cannot be returned, and the Stock the User now has is exactly what the tick still contributes. Edited up, or topped up: only the amount the tick added goes and the rest stays, because that part is not the tick's. Edited down: all of it. Moved to another Storage Place: the Lot keeps its id and goes the same way; a Lot split by a partial Move loses what is left of the original, and the part moved away stays (it is a Lot of its own).
3. **Leave-it was rejected.** Leaving a partly used Lot would keep Stock the User did not mean to keep and gives a different result on the same tap depending on what was cooked; refusing the Undo would strand the Line ticked.
4. **Idempotent.** The tick row is the record: it is removed with the take-back, so a second untick, or an untick with no tick, finds nothing and takes nothing. A Lot already gone (used up, deleted) is not an error. If Stock fails, the tick stays so the Undo can be tried again.
5. **Records of what was bought for follow the Lot** (ADR 0013): removed when the Lot is gone, kept while part of it stays.
6. **A tick set by a Scan owns no Lot.** Unticking it (Shop screen) changes no Stock; Undo of the Scan does, as before.
7. **The Lot is not "topped up" by a tick today:** every tick adds its own Lot; `created: false` is only a retry with the same client id, which finds the first Lot. A tick over an existing tick keeps the earlier Lot in Stock and tracks the newest.
8. **Offline.** The Shop screen has no offline queue for unticks; a failed Undo toasts "Couldn't undo that tick. Try again." and changes nothing. The Scan screen's queue holds Scans, not ticks.

## Consequences

- Stock port `TakeBack`; Stock service `TakeBackLot`; pure `stock.TakeBack`; migration 1560; `useShoppingActions` refreshes Stock after an untick.
- GLOSSARY: Tick gets a note. Spec §7 wording "unticking" in the Bought sentence stays true.
