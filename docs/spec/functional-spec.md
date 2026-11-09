# Feeder: functional specification (v1)

Status: **draft for review** (2026-11-09). The terms in **bold** are defined in [GLOSSARY.md](../../GLOSSARY.md). Decisions behind this spec are in [docs/adr/](../adr/), and look and feel in [docs/design/ux-brief.md](../design/ux-brief.md) (direction: Bento). The open points raised while writing this spec were resolved on 2026-11-09 (§15).

## 1. Scope

**In v1:** Household setup; Recipes with timed Steps and images; Ingredients, Products and Shops; Stock tracked as Stock Lots; the automatic planner with Leftovers; the Shopping List; in-store and home scanning (offline-capable); Cook Mode; the kitchen board; Recipe File import/export and the Agent Prompt; Web Push reminders; per-User theming; Google sign-in; nightly backups; a Docker image published to GHCR.

**Out of v1:** multiple Households per instance; external product databases; nutrition; calendar (ICS) feeds; a freezer for Leftovers; receipt OCR; languages other than English (strings are externalised, so translations can be added later).

## 2. Users, roles and access

- Sign-in is Google OAuth only. A Google account whose email isn't on the **allowlist** is refused with a "not invited" page.
- The `FEEDER_ADMIN_EMAIL` environment variable is mandatory: the container refuses to start without it. It seeds the allowlist with the first **Admin**.
- **Admin** manages the allowlist, Members, Meal Slots, Shops, Weight Barcode Rules and household settings. Every **User** can do everything else.
- A User may be linked to a **Member**. That link decides whose Favourites, Dislikes and Exclusions the User edits by default.
- Sessions: an HTTP-only, SameSite=Lax cookie with a 30-day sliding expiry. Removing a User from the allowlist ends their sessions immediately.

## 3. Household setup

| Setting | Default | Notes |
|---|---|---|
| Time zone | from the browser at first setup | All slot times and reminders use it. |
| Planning Horizon | 7 days | 1–28. |
| Default Cool-down | 7 days | Recipes can override it. |
| Default Leftover Use-by | 3 days | Recipes can override it. |
| Quiet hours | 22:00–07:00 | No push notifications in this window, except timers. |
| Planner Style | middle (default preset) | A single slider with three anchors: "Use what we have" (boosts perishable use, **Ingredient Overlap** and stock coverage), "Variety" (boosts recency, dampens Favourites) and "Favourites" (boosts Favourites). Each anchor maps to a weight preset, and positions between anchors interpolate (§7.2). |
| Location | none | City or coordinates, set by the Admin. Used to compute local sunset and sunrise for the kitchen board's dark mode (§11). Without one, the board uses 19:00–07:00. |

**Members**: a name, a colour/avatar and a default **Portion Factor** (adult 1.0; any value from 0.25 to 3, in 0.25 steps).

**Meal Slots** are defined per weekday. Each has a name (e.g. Lunch), a usual time and a default **Attendance** (which Members attend, each with an optional Portion Factor override). The same slot name can exist on several weekdays with different times or attendance. A one-off change for a specific date ("Sam is away Thursday") edits that date's Attendance only.

**Portions needed** for a slot = the sum of the Portion Factors of the attending Members.

## 4. Recipes

These fields mirror the Recipe File ([recipe-file.md](recipe-file.md)): name, description, **Yield**, Ready Meal flag, **Tags**, Cool-down and Use-by overrides, image, source, ingredient lines (for one **Batch**) and **Steps** (active, passive or **Advance Step**, with an optional duration, image, `after` dependencies and `uses`).

- **Total time** is the critical path of the schedule (recipe-file.md, *Steps and timing*), shown on Recipe tiles. Advance Steps show separately ("+4 h marinate").
- Recipes can be **archived**: they are excluded from planning but kept for history. Hard delete is only possible if the Recipe was never planned.
- Recipe editor: an ingredient line's unit is validated against the Ingredient's units, and an unknown unit prompts for a **Unit Conversion** inline.

## 5. Ingredients, Products, Shops

**Ingredient**: a name, **Base Unit**, Unit Conversions and an optional **Shelf Life**. Renaming an Ingredient keeps all its references. Two Ingredients can be merged (references move, conversions combine, and conflicts are shown).

**Product**: a name, the Ingredient it supplies, its pack size (in the Ingredient's Base Unit), optional global barcodes (EAN/UPC) and the Shops known to sell it. Products are created only through the "what is this?" form during scanning, or from an Ingredient's page.

**Shop**: a name. It has:
- **Shop Barcodes**: a code mapped to a Product, valid only in that Shop;
- **Weight Barcode Rules**: a barcode prefix (e.g. `21`), the digit positions of the item code, the digit positions of the value, whether the value is a weight (in g) or a price (in cents), and the decimal places. When the value is a price, the weight is derived from that Product's last known price per kg at that Shop. If there is no **Price** history, the app asks the user for the weight once, which also records the price per kg for next time;
- **Prices**: a Price for a Product at a Shop on a date. The latest one prefills the next scan.

**Barcode resolution** (at a Shop, in this order): that Shop's Shop Barcode → that Shop's Weight Barcode Rules → global Product barcode → unknown. When scanning at home (no Shop), only global barcodes apply.

## 6. Stock

- Stock is a set of **Stock Lots**. Each holds an Ingredient, a quantity in Base Units, a purchase date and a go-off date (purchase date + Shelf Life, or none). The source is a scan, a Stock-take or a manual entry.
- Lots are **added** by scanning at a Shop (pack size or decoded weight), by Stock-take, or by manual "add".
- Lots are **deducted** only when a Planned Meal is marked **Cooked** ([ADR 0003](../adr/0003-stock-lots-deducted-on-cooked.md)): Batches × ingredient quantity (optional lines excluded), taken from the lot that goes off soonest first, then the oldest. Marking as Cooked never blocks. If Stock is short, it warns (e.g. "Stock shows only 300 g chicken thighs, the recipe uses 800 g") and offers a one-tap Stock correction. If the warning is dismissed, Stock floors at 0 and the missing amount is ignored.
- **Stock-take** sets an Ingredient's total. A decrease removes quantity from the soonest-to-spoil lots first. An increase adds a new lot dated today.
- Lots past their go-off date are listed as **spoiled** on Today ("Throw out or keep?"). "Throw out" removes the lot and records the waste, which feeds the zero-waste streak. "Keep" pushes the go-off date out by 1 day.

## 7. The planner

### 7.1 When it runs
- Every night at 03:00 (household time), it fills the Planning Horizon.
- Immediately after any change that invalidates a plan: a Recipe edited or archived, Attendance changed, a meal unpinned, a Cooked confirmation that changes the Leftover count, or a Stock-take.
- On demand: **Regenerate** redoes every unpinned, uncooked Planned Meal in the horizon.

It never changes **Pinned** or **Cooked** Planned Meals. A Planned Meal becomes Pinned when a User sets, swaps or confirms it.

### 7.2 Algorithm
The planner walks the empty slots in chronological order, keeping a **projected Stock** (current lots, plus planned purchases, minus planned consumption) and a list of **pending Leftovers**.

For each slot:
1. **Leftover first.** Take the pending Leftovers that fully cover the slot's portions, are still before their Use-by, and have no attending Member with an Exclusion on that Recipe or its Ingredients. If one exists and no Slot Rule claims the slot, place the one with the soonest Use-by. Dislikes are ignored for Leftovers.
2. **Candidates.** Start from all non-archived Recipes, or only those a Slot Rule names (by Recipe or Tag). Remove any that:
   - have an Exclusion for an attending Member (on the Recipe or any of its Ingredients);
   - fall within their Cool-down (counted from the last planned or cooked date);
   - would break a Variety Rule;
   - have an Advance Step whose lead time has already passed for this slot.
3. **Score** each candidate. The weights below are the default (middle) preset. They stay internal (in code and tests); the household only sets the **Planner Style** slider (§3), whose anchors each map to a weight preset, with positions in between interpolated:
   - **+3** per attending Member's Favourite, **−2** per Dislike;
   - **+4 × perishable use**: the share of the Recipe's base-unit needs covered by projected lots that go off before the next time those lots could be used, which rewards spending what would spoil;
   - **+2 × Ingredient Overlap**: the share of needs covered by remainders of packs already planned for purchase in the horizon (e.g. the 600 g left from a 1 kg chicken pack);
   - **+1 × stock coverage**: the share of needs covered by projected Stock overall;
   - **+1** if the Batch surplus would fit a later slot as a Leftover; **−1** if it would be wasted (no slot fits before its Use-by);
   - **−0.5 × (Recipes not cooked in a while)**, a recency term that is negative for recent ones, so Recipes not cooked for a while score higher;
   - **± 0.5** jitter, seeded per generation so that Regenerate gives a genuinely different plan.
4. **Pick** the top-scoring candidate. Batches = ceil(portions needed ÷ Yield). The surplus (Batches × Yield − portions needed) becomes a pending Leftover with its Use-by. Projected Stock is updated, and any shortfall is recorded as a planned purchase in pack units of the Product last bought for that Ingredient (at the chosen Shop if known). If no Product has been bought yet, exact amounts are assumed, with no pack remainder.
5. **Why chips** are the 1–3 largest positive score terms, phrased for people: "uses Monday's chicken", "Anna's favourite", "spinach goes off Thu", "Slot Rule: Friday", "leftover from Tue".

If no candidate survives, the slot stays empty and Today shows "Couldn't plan Thursday dinner: every option was excluded or in cool-down."

### 7.3 Swap
**Swap** shows the top 3 alternatives under the same scoring (excluding the current Recipe), each with its why chips. Choosing one pins it and replans the downstream unpinned slots, because Leftovers and Overlap may change.

## 8. Cooked and Leftovers

- **Mark as Cooked** (from Cook Mode, Today or the Plan) shows the proposed Leftover portions (Batches × Yield − Attendance need), which the User can edit with a ± control. Confirming:
  1. deducts Stock (§6);
  2. records the actual Leftover with its Use-by = cooked date + the Use-by days;
  3. replans: if the actual Leftover is smaller than what was already placed, the affected Leftover meals are unpinned and replanned; if it is larger, the extra becomes a pending Leftover.
- **Not cooked** ("we had takeaway") marks the meal as skipped: no Stock change and no Leftovers, and the Leftover meals that depended on it are replanned.
- A Planned Meal that is still unconfirmed 2 h after its slot time appears in Today's "To confirm" tile and triggers a reminder.
- Leftovers past their Use-by are discarded automatically and count as waste.

## 9. Shopping List

- **Range:** uncooked, non-skipped Planned Meals from now up to a date the User chooses (default today + 7 days, capped at the horizon).
- **Need** per Ingredient = the sum, over those meals, of Batches × quantity (converted to Base Unit, optional lines excluded). Leftover meals need nothing.
- **Available** = projected Stock lots still within their go-off date on the date each meal needs them.
- **Line** = need − available, if positive. Display: the quantity in Base Unit, plus a pack suggestion from the Product last bought for the Ingredient (at the selected Shop if known), e.g. "1400 g · 2 × Mutti 700 g". Packs are rounded up, and the expected remainder feeds Ingredient Overlap. If no Product has been bought yet, the line shows the exact amount with no pack remainder.
- **Manual extras:** a free-text line (e.g. "toilet paper"), or an Ingredient with a quantity. Neither is tied to the plan, and a manual extra stays until it's ticked or deleted.
- **Estimated cost:** the sum of suggested packs × the latest Price at the selected Shop (or any Shop if there's none at the selected one). Lines without a price show "—".
- The list recomputes live as the plan or Stock changes. Ticked state is kept per Ingredient for the current list range.
- **Tick by hand** (for weighed produce without a barcode, or items scanned elsewhere): it asks "how much?", prefilled with the line quantity, and adds a Stock Lot.

## 10. Scanning

### 10.1 Shop mode
Started from the centre **Scan** button. It picks the Shop (the last one used, or one chosen from a list), then shows the compact viewfinder strip above the live Shopping List. Scanning is continuous; each successful read gives a short beep and a haptic buzz, with a per-device mute toggle. iOS Safari has no vibration API, so the beep is the confirmation there.

On a resolved barcode:
1. A Stock Lot is added (pack size, or the decoded weight).
2. The Product is recorded as sold at this Shop.
3. The matching Shopping List line's remaining quantity is reduced, and the line is ticked and slides away when it reaches ≤ 0.
4. A toast shows "Passata +700 g · €1.59 ✎ · Undo". The price is prefilled from the last Price at this Shop. Tapping ✎ edits it, and leaving it as is confirms it. Undo reverses steps 1–3.
5. Off-list items are added to Stock just the same, with a toast saying "not on the list".

On an **unknown barcode**, a bottom sheet asks:
- which Ingredient it is (searchable, or create a new one);
- the pack size and unit;
- a Product name (prefilled as "<Ingredient> <size>");
- whether it's a global or a Shop-only barcode.

Saving creates the Product (and Shop Barcode) and then proceeds as for a resolved barcode. A barcode matching a Shop's Weight Barcode Rule prefix whose item code is unknown asks only for the Ingredient and Product name.

When the list is empty, the **Shopping list complete** celebration appears with the number of items, the total spent and the number of Stock Lots added.

### 10.2 Stock-take mode
This is the same scanner without a Shop. Each scan opens a sheet with the Product and current Stock, plus **+1 pack**, **−1 pack** and **Set total**.

### 10.3 Offline and sync
- The PWA caches the app shell, the current Shopping List, Products with their barcodes, Shop Barcodes and Weight Barcode Rules.
- Scans made offline are queued with a client UUID and a timestamp, and applied in order when back online. The server is idempotent on the UUID.
- Unknown-barcode forms filled in offline are created on sync. If two people created the same barcode, the second is merged into the first, with a notice.
- Live updates use Server-Sent Events (Shopping List, plan, Stock, timers), so two shoppers see each other's ticks within about 1 s.

### 10.4 Camera
The camera uses the `BarcodeDetector` API where available, otherwise a WASM fallback (e.g. ZXing). It needs HTTPS. A torch toggle is shown when the camera supports one. Formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR and DataMatrix. QR/DataMatrix payloads that are GS1 Digital Link URLs are parsed for their GTIN (AI 01) and treated like an EAN/UPC. Other QR content is ignored with a "not a product code" toast.

## 11. Cook Mode and the kitchen board

- **Cook Mode** opens for a Planned Meal (or a Recipe with a chosen Batch count). Steps are shown one at a time, with the `uses` amounts scaled to the Batches. Completed Advance Steps are listed above as done; ones not done show a warning.
- Passive Steps start a **timer** when the Step is reached. Timers keep running across Steps and are shown as tiles, with an alarm sound plus a push notification when one ends. Timers are synced, so the phone and the tablet show the same timers.
- **Navigation:** Back/Next tiles; on a tablet, tapping the left or right half of the step tile also works. Optional voice commands ("next", "back", "repeat", "start timer", "pause timer") use the browser's speech recognition where available, and are off by default.
- The screen stays awake (Wake Lock). The last Step offers **Mark as Cooked** (§8).
- **Kitchen board** (tablet, the `/board` route): a Bento grid with the clock, tonight's meal, the next Advance Step, Leftovers, use-soon lots, running timers, tomorrow's meals and the zero-waste streak. It refreshes live, switches to dark at local sunset and back at sunrise (computed from the household Location in §3, falling back to 19:00–07:00 if none is set), and has a big button to start Cook Mode.

## 12. Notifications (Web Push)

Each User opts in per device, and per notification type:

| Type | When |
|---|---|
| Advance Step due | slot time − lead time (e.g. "Marinate the chicken now for 19:30") |
| Start cooking | slot time − total time |
| Confirm Cooked | 2 h after slot time if still unconfirmed |
| Leftover Use-by | 10:00 on the Use-by date |
| Stock about to spoil | 10:00 the day before a lot goes off, if no plan uses it |
| Timer finished | immediately, ignoring quiet hours |

Notifications are suppressed during quiet hours (except timers) and deferred to the end of the quiet window.

## 13. Import and export

- **Export:** pick one or more Recipes, or all of them, and download a `.feeder.json` file with images embedded ([recipe-file.md](recipe-file.md)).
- **Import:** upload or paste JSON, then go through Import Review (recipe-file.md, *Import Review*).
- **Copy Agent Prompt:** copies the prompt template with the schema and example inlined.

## 14. Theming and layout

- Each User sets light, dark or system mode, an accent colour and an optional secondary colour. The palette is derived from the accent (tinted surfaces, tonal steps) with automatic WCAG AA contrast checks. Status colours (spoil, leftover) are fixed and not derived from the accent.
- Layout: Bento, as in the ux-brief. Phone uses a bottom bar (Today · Plan · Scan · Shop · Recipes); desktop uses a side rail with a wider grid; the tablet board is a separate route.
- `prefers-reduced-motion` turns off springs and the celebration animations.

## 15. Resolved decisions (2026-11-09)

1. `FEEDER_ADMIN_EMAIL` is mandatory; the container refuses to start without it, and it seeds the first Admin (§2).
2. Sessions: HTTP-only SameSite=Lax cookie, 30-day sliding expiry; removing a User from the allowlist ends their sessions immediately (§2).
3. A price-valued Weight Barcode Rule derives the weight from the Product's last known price per kg at that Shop; with no price history, the user is asked for the weight once (§5).
4. Mark as Cooked never blocks; short Stock triggers a warning with a one-tap Stock correction, and dismissing floors Stock at 0 (§6, §8).
5. Scoring weights stay internal; the household sets a single Planner Style slider with three anchors, and the current numbers are the middle preset (§3, §7.2).
6. Both the recency preference and the seeded ±jitter stay (§7.2).
7. Planned purchases use the pack size of the Product last bought (at the chosen Shop if known); with none bought, exact amounts and no remainder (§7.2, §9).
8. A successful scan gives a beep and a haptic buzz, with a per-device mute; iOS Safari relies on the beep (§10.1).
9. Barcode formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR and DataMatrix; GS1 Digital Link URLs are read for their GTIN, other QR content is ignored (§10.4).
10. The kitchen board goes dark at local sunset and light at sunrise from an Admin-set household Location, falling back to 19:00–07:00 (§3, §11).
