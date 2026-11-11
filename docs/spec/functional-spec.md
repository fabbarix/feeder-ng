# Feeder: functional specification (v1)

Status: **draft for review** (2026-11-09). The terms in **bold** are defined in [GLOSSARY.md](../../GLOSSARY.md). Decisions behind this spec are in [docs/adr/](../adr/), and look and feel in [docs/design/ux-brief.md](../design/ux-brief.md) (direction: Bento). The open points raised while writing this spec were resolved on 2026-11-09 (§15).

## 1. Scope

**In v1:** Household setup; Recipes with timed Steps and images; Ingredients, Products and Shops; Stock tracked as Stock Lots; the automatic planner with Leftovers; the Shopping List; in-store and home scanning (offline-capable); Cook Mode; the kitchen board; Recipe File import/export and the Agent Prompt; Web Push reminders; per-User theming; Google sign-in; nightly backups; a Docker image published to GHCR.

**Out of v1:** multiple Households per instance; external product databases; nutrition; calendar (ICS) feeds; a freezer for Leftovers; receipt OCR; languages other than English (strings are externalised, so translations can be added later).

## 2. Users, roles and access

- Sign-in is Google OAuth only, and only for a verified Google email. A person signs in at once if their email is on the **allowlist** or is the email of a **Member**. Anyone else creates an **Access Request** and sees a "Waiting for approval" page, with no session and no access to any data. Any signed-in User can approve (adding a non-Admin User) or deny it; one approval is enough. A denied email may ask again after 24 hours; a request expires after 14 days. Requests are limited per IP (10 an hour), per email (3 a week) and in total (50 pending), and every approval, denial and expiry is recorded with who did it. Settings lists the pending requests, and a count badge shows on the avatar menu.
- The `FEEDER_ADMIN_EMAIL` environment variable is mandatory: the container refuses to start without it. It seeds the allowlist with the first **Admin**.
- **Admin** manages the allowlist, Members, Meal Slots, Shops, Weight Barcode Rules and household settings. Every **User** can do everything else.
- A User may be linked to a **Member**. That link decides whose Favourites, Dislikes and Exclusions the User edits by default.
- The Google sign-in redirect URI is `<FEEDER_BASE_URL>/auth/google/callback`.
- Sessions: an HTTP-only, SameSite=Lax cookie with a 30-day sliding expiry. Removing a User from the allowlist ends their sessions immediately.

## 3. Household setup

The Household records the moment it was created in Feeder (never edited, not a setting). It only feeds the zero-waste streak's age cap (§6.1). An install that predates this takes the earliest of its first User, Member or Stock Lot.

| Setting | Default | Notes |
|---|---|---|
| Time zone | from the browser at first setup | All slot times and reminders use it. |
| Planning Horizon | 7 days | 1–28. |
| Default Cool-down | 7 days | Recipes can override it. |
| Default Leftover Use-by | 3 days | Recipes can override it. |
| Quiet hours | 22:00–07:00 | No push notifications in this window, except timers. |
| Planner Style | Variety (middle anchor) | A single slider with three anchors: "Use what we have" (boosts perishable use, **Ingredient Overlap** and stock coverage), "Variety" (the default; leans furthest into recency and dampens Favourites) and "Favourites" (boosts Favourites). Each anchor maps to a weight preset, and positions between anchors interpolate linearly (§7.2). |
| Currency | USD | Admin-managed. Used for **Prices**, the estimated cost and price-valued Weight Barcode Rules. |
| Location | none | City or coordinates, set by the Admin. Used to compute local sunset and sunrise for the kitchen board's dark mode (§11). Without one, the board uses 19:00–07:00. |

**Members**: a name, a colour/avatar and a default **Portion Factor** (adult 1.0; any value from 0.25 to 3, in 0.25 steps). A Member may have an email; see §2. The avatar is a **photo**, an **emoji** or the Member's **initials**, the Admin's choice in the Member sheet ("Avatar: Initials, Emoji, Photo"). Wherever the avatar is drawn, the photo is shown first, then the emoji, then the initials; a photo that cannot be loaded falls back to the emoji, then the initials. The photo is added with the shared image picker (a square crop) and is stored as an image id (`photo`, with the read-only `photoUrl`); it is removed with the Member, and with it when the Admin switches the Member to an emoji or initials. Only an Admin can set it, like every other Member field.

**Meal Slots** are defined per weekday. Each has a name (e.g. Lunch), a usual time and a default **Attendance** (which Members attend, each with an optional Portion Factor override). The same slot name can exist on several weekdays with different times or attendance. A one-off change for a specific date ("Sam is away Thursday") edits that date's Attendance only.

**Editing a Meal Slot on several days** (R15, ui-review-2 §3.7). The Meal Slot editor has an "Apply to" choice of weekdays (seven toggle chips, Monday first, plus the quick picks "All days with <name>", "Weekdays" and "Weekend"); it starts with the day being edited. The change (name, usual time, usual Attendance; only the fields the Admin changed) applies to the **Matching Meal Slot** on each chosen weekday: the Meal Slot with the same name. A chosen weekday without one is **skipped** (nothing is created). Before saving the editor lists what will happen ("Update Dinner on Mon, Tue, Wed", "Thu skipped: no Dinner"); after saving it says it again ("Updated Dinner on Mon, Tue, Thu. Wed has no Dinner, so it was skipped."). The edit is **all or nothing**: if any matching Meal Slot cannot take the change (for example a rename that clashes with a Meal Slot already on that weekday), none is changed. Adding a Meal Slot uses the same weekday chips. Editing no longer moves a Meal Slot to another weekday: add it there and remove the old one.

**The Meal Slots overview shows who attends.** Each Meal Slot shows its Attendance as Member pills (Member colour, avatar or initials, first name), four at most and "+N" for the rest. A Meal Slot nobody attends shows a "Nobody attending" warning pill that leads to choosing who attends. From 1024 px wide the overview is a week table (days as columns, Meal Slot names as rows). Every Meal Slot has an anchor (`/settings/meal-slots#meal-slot-<id>`), which Couldn't plan uses for "Choose who attends".

**Attendance defaults to everyone** (R13, decision 23). A new Meal Slot includes every current Member as attending, each at their own Portion Factor (no override), unless the request names an Attendance explicitly (an explicit empty list means nobody, a deliberate choice). A new Member is added to every existing Meal Slot's usual Attendance, including slots that were left empty. People opt out, in the Meal Slots editor (usual Attendance) or for one date (Date Attendance). Date Attendance overrides are never touched by adding a Member: a date the Household already edited keeps its list. Deleting a Member still removes them from every Attendance. When an existing install is upgraded, a one-off migration gives every Meal Slot that has no attendees all current Members (§15, decision 23); it runs once, automatically, and slots that already have attendees are left alone.

**Portions needed** for a slot = the sum of the Portion Factors of the attending Members.

## 4. Recipes

These fields mirror the Recipe File ([recipe-file.md](recipe-file.md)): name, description, **Yield**, Ready Meal flag, **Tags**, Cool-down and Use-by overrides, **Reheat time** (optional, 1 to 30 whole minutes), image, source, ingredient lines (for one **Batch**) and **Steps** (active, passive or **Advance Step**, with an optional duration, image, `after` dependencies and `uses`).

- **Total time** is the critical path of the schedule (recipe-file.md, *Steps and timing*), shown on Recipe tiles. Advance Steps show separately ("+4 h marinate").
- Recipes can be **archived**: they are excluded from planning but kept for history. Hard delete is only possible if the Recipe was never planned.
- A Recipe's **Reheat time** is optional. It is a whole number of minutes from 1 to 30; blank means not set. The Recipe editor shows it as a compact number field after the Use-by field. It is flat for the Planned Meal (it does not grow with the number of portions) and Reheat clamps it to its own 30 seconds to 30 minutes range. A value outside 1 to 30 is refused with `validation_failed`, `reason: reheat_invalid`, `field: reheatMinutes`.
- Recipe editor: an ingredient line's unit is validated against the Ingredient's units, and an unknown unit prompts for a **Unit Conversion** inline.
- **Creating an Ingredient from a line.** The Ingredient picker of an ingredient line offers "Create Ingredient '<typed name>'" as its last option when the typed name matches no Ingredient exactly (case, accents and spacing ignored). It opens the New Ingredient sheet over the editor with the name filled in; the Recipe draft is kept untouched, with no navigation. Before creating, Feeder asks "Did you mean Garlic?" for a near match, using the same matching as Import Review, and offers to use the existing Ingredient. Saving creates the Ingredient, selects it on that line and puts focus in the line's quantity. A unit already on the line stays; if it is not convertible for the new Ingredient the usual inline **Unit Conversion** prompt follows on save. The Recipe editor needs a connection to save, so offline the option is shown disabled with the reason "Needs a connection to create an Ingredient".
- **A Ready Meal and its Ingredient.** Feeder keeps an Ingredient with the Recipe's name so the pack can be stocked and bought. Marking a Recipe as a Ready Meal puts that Ingredient on its one line: an existing Ingredient with the same name (case and spacing ignored) is used, never duplicated; otherwise one is created on save, with Base Unit piece and no Shelf Life. The line is 1 piece (an existing same-name Ingredient counted in g or ml is selected with its Base Unit and the quantity left for the User, as Feeder never invents a pack size). The editor says "Feeder adds an Ingredient called '<name>' so you can stock and buy it". The line follows the name until the User edits it. Renaming a saved Ready Meal offers to rename its Ingredient too (never done silently, and not offered if another Ingredient already has the new name). Unmarking a Ready Meal keeps its Ingredient and its line, which become ordinary and editable; a line that was only pending (nothing created yet) is dropped. The API takes a Ready Meal with no lines as "make the pack line": it applies the same rule, in the same transaction as the Recipe, and answers `validation_failed`, `field: lines`, `reason: ready_meal_unit` when the same-name Ingredient is counted in g or ml.

## 5. Ingredients, Products, Shops

**Ingredient**: a name, **Base Unit**, Unit Conversions, an optional **Shelf Life** and an optional **picture**. Renaming an Ingredient keeps all its references. Two Ingredients can be merged (references move, conversions combine, and conflicts are shown).

The **New Ingredient** sheet asks for a name, a Base Unit (g, ml or piece, g unless a Recipe line or Scan already gave a unit) and an optional Shelf Life in days; the sheet also has an optional **Picture** (the shared image picker, 4:3 crop); everything else (Unit Conversions) is edited on the Ingredient's page, whose Picture Tile can add, replace, crop or remove it at any time, even while the Ingredient is in use (only the Base Unit locks). The Ingredients list shows the picture as a small thumbnail. A picture is stored as an image id (`image`, with the read-only `imageUrl`); replacing or removing it, merging the Ingredient away or deleting it removes the old file. When two Ingredients merge, the survivor keeps its own picture, or takes the merged-away Ingredient's when it has none. It validates inline instead of disabling its button, and asks "Did you mean ...?" before creating a name close to an existing Ingredient. It is opened from the Ingredients screen, from an ingredient line of the Recipe editor, and from the "what is this?" form.

**Product**: a name, the Ingredient it supplies, its pack size (in the Ingredient's Base Unit), optional global barcodes (EAN/UPC) and the Shops known to sell it. Products are created only through the "what is this?" form during scanning, or from an Ingredient's page.

**Shop**: a name. It has:
- **Shop Barcodes**: a code mapped to a Product, valid only in that Shop;
- **Weight Barcode Rules**: a barcode prefix (e.g. `21`), the digit positions of the item code, the digit positions of the value, whether the value is a weight or a price, its unit, and the decimal places. The unit is configured per rule: for a weight, g (default), kg, oz or lb; for a price, the household currency's minor unit (cents by default). The decoded value = digits ÷ 10^decimal places, in that unit. Internally all quantities are stored in metric Base Units (g, ml or piece) and price per weight is kept per kg. When the value is a price, the weight is derived from that Product's last known price per kg at that Shop. If there is no **Price** history, the app asks the user for the weight once, which also records the price per kg for next time;
- **Prices**: a Price for a Product at a Shop on a date. The latest one prefills the next scan.

**Archiving Products.** A Product that was bought (it has a purchase, or Stock Lots refer to it) cannot be deleted; delete answers `409 product_bought` and the UI offers **Archive** instead. A Product never bought can still be deleted. An **archived** Product (like an archived Recipe, §4) can be **unarchived** at any time. While archived it:
- is not shown in Product lists and pickers (the admin/catalogue view can include archived Products);
- is left out of the Catalog and of barcode resolution, so a Scan of its barcode is **unknown**; the online resolve names the archived Product so the app can offer "Unarchive?" before creating a new one;
- is never suggested as the Product last bought (§7.2, §9): the suggestion falls back to the next most recent non-archived Product, or to exact amounts if there is none;
- keeps its purchase history, Prices, barcodes and Shop Barcodes. It still **owns its barcodes**: a new Product (or another Product) cannot claim one of them (`409 barcode_archived`); the user unarchives the owner instead.
A purchase or Price that arrives late for an archived Product (an offline phone syncing) is still recorded.

**Barcode resolution** (at a Shop, in this order): that Shop's Shop Barcode → that Shop's Weight Barcode Rules → global Product barcode → unknown. When scanning at home (no Shop), only global barcodes apply.

## 6. Stock

- Stock is a set of **Stock Lots**. Each holds an Ingredient, a quantity in Base Units, a purchase date and a go-off date (purchase date + Shelf Life, or none). The source is a scan, a Stock-take or a manual entry.
- Lots are **added** by scanning at a Shop (pack size or decoded weight), by Stock-take, or by manual "add".
- Lots are **deducted** only when a Planned Meal is marked **Cooked** ([ADR 0003](../adr/0003-stock-lots-deducted-on-cooked.md)): Batches × ingredient quantity (optional lines excluded), taken from the lot that goes off soonest first, then the oldest. Marking as Cooked never blocks. If Stock is short, it warns (e.g. "Stock shows only 300 g chicken thighs, the recipe uses 800 g") and offers a one-tap Stock correction. If the warning is dismissed, Stock floors at 0 and the missing amount is ignored.
- **Stock-take** sets an Ingredient's total. A decrease removes quantity from the soonest-to-spoil lots first. An increase adds a new lot dated today.
- Lots past their go-off date are listed as **spoiled** on Today ("Throw out or keep?"). "Throw out" removes the lot and records the waste. "Keep" pushes the lot's go-off date out by 1 day from its existing go-off date (not from today) and records the day it was chosen. Both feed the zero-waste streak (below). Throw out and Keep are offered only for a Lot that has gone off.

### 6.1 Zero-waste streak
The streak is the number of whole household days (household time zone, §3) since the last **waste event**, never more than the Household's age. It is shown on Today and on the Kitchen board (§11); both show the same number.

- **Go-off day.** A Lot is still fine on its go-off date; it **goes off** on the next household day (go-off date + 1), the first day it is listed as spoiled. A Lot with no go-off date never goes off.
- **Waste events.** A waste event counts on one household day:
  1. *A Lot going off.* The day it went off, whether or not anyone has acted on it yet. It counts the moment the day starts, so a Lot that went off today makes the streak 0 today.
  2. *A Throw out of a Lot that had already gone off* is the same event as (1): it counts on the day the Lot went off, **not** on the day of the Throw out. It is never a second event. So a Lot that went off Monday and is thrown out on Thursday resets the streak on Monday.
  3. *Waste of anything not covered by (1)*: a Leftover discarded after its Use-by (§8) counts on the day it was discarded; a Lot thrown out that was **not** an unforgiven go-off (see Keep) counts on the day of the Throw out. Waste of such a Lot on the day it is recorded makes the streak 0 that day.
- **The go-off persists.** Once a Lot has gone off unforgiven, the event stays on its day however the Lot later leaves Stock: Throw out (see 2), used up by a Cooked meal (Cooked deducts the soonest-to-go-off Lot first, so spoiled Lots go first), counted away by a Stock-take, or any other removal except Undo of a scan (a correction, not a go-off). A partly used Lot still counts once. The event is kept as a go-off record with no quantity: it is not waste and does not appear in waste lists or reports.
- **Keep.** Choosing Keep means the Lot did not go off: every go-off of that Lot up to and including the day of the Keep is forgiven, even when the pushed go-off date is still in the past (Keep moves it by one day only, so the Lot stays on the spoiled list and may be kept again). If the Lot then goes off again after the day of the Keep, that is a new waste event on that new go-off day. Throwing out a Lot whose go-off was forgiven counts as in 3, on the day of the Throw out.
- **Household age cap.** The streak is at most the number of days since the Household was created in Feeder (household date of creation, in the household time zone). Go-offs and waste dated before the Household existed (backdated purchase dates, imported dates) do not reduce it below the cap and never raise it above it. Purchase dates alone never lengthen the streak.
- **No Lots at all.** The streak is the Household's age: days since creation (0 on the creation day). Having no Stock is not waste.
- Waste events dated in the future are ignored. All dates are household dates, so around midnight the same instant can be two different days for two time zones.

## 7. The planner

### 7.1 When it runs
- Every night at 03:00 (household time), it fills the Planning Horizon.
- Immediately after any change that invalidates a plan: a Recipe edited or archived, Attendance changed, a meal unpinned, a Cooked confirmation that changes the Leftover count, or a Stock-take.
- On demand: **Regenerate** redoes every unpinned, uncooked Planned Meal in the horizon.

It never changes **Pinned** or **Cooked** Planned Meals. A Planned Meal becomes Pinned when a User sets, swaps or confirms it.

### 7.2 Algorithm
The planner walks the empty slots in chronological order, keeping a **projected Stock** (current lots, plus planned purchases, minus planned consumption) and a list of **pending Leftovers**.

For each slot:
1. **Leftover first.** Take the pending Leftovers that fully cover the slot's portions, are still before their Use-by, and have no attending Member with an Exclusion on that Recipe or its Ingredients. If one exists and no Slot Rule claims the slot, place the one with the soonest Use-by. A Leftover may also fill a slot claimed by a Slot Rule if the Leftover's Recipe satisfies that rule (it is the named Recipe, or carries the Tag the rule names); otherwise the Slot Rule wins. Among several such Leftovers, the one with the soonest Use-by is placed. Dislikes are ignored for Leftovers.
2. **Candidates.** Start from all non-archived Recipes, or only those a Slot Rule names (by Recipe or Tag). Remove any that:
   - have an Exclusion for an attending Member (on the Recipe or any of its Ingredients);
   - fall within their Cool-down (counted from the last planned or cooked date);
   - would break a Variety Rule ("per week" means the ISO week, Monday to Sunday; Leftovers don't count towards Variety Rules);
   - have an Advance Step whose lead time has already passed for this slot.
   - are **reserved** for a later Slot Rule slot (see *Slot Rule reservation* below).
**Slot Rule reservation.** A Slot Rule's Recipe is kept for its slot. While the planner walks an earlier slot, it removes a Recipe R from the candidates if R is *reserved* for a later slot S and placing R here would put S inside R's Cool-down (the gap in days between the two slots is less than R's Cool-down; slots on the same day count as a gap of 0).
- **Which reservations exist.** S reserves R when S has a Slot Rule and R is the only Recipe it can still take: the rule names R directly, or the rules' Recipes and Tags together match exactly one eligible Recipe (not archived, no Exclusion for a Member attending S). When several eligible Recipes match (a Tag carried by two Recipes), nothing is reserved, because the others can fill S. S must still be open: a Pinned, Cooked or skipped meal in S reserves nothing. An unpinned Planned (kept) meal in S counts as open: it is replaced if the rule calls for it, so it still reserves.
- **Window.** The Cool-down of R before S, anywhere in the Planning Horizon, including slots whose meal Plan would otherwise keep: an unpinned Planned Meal of R inside the window is replanned, and its slot takes another Recipe. Regenerate behaves the same.
- **Pinned wins.** A Pinned or Cooked meal of R (or a cook before the horizon) already inside S's Cool-down makes the rule unmeetable, so no reservation is made: nothing else is held back, and S stays empty with its usual reason ("Couldn't plan Friday dinner: every option was excluded or in cool-down."). If two open Slot Rule slots reserve the same Recipe inside each other's Cool-down, the earlier slot keeps it and the later one stays empty.
- **Swap.** Swap applies the reservation too: it does not offer R as an alternative for a slot where it would block S. For S itself Swap still ignores the Slot Rule (§7.3). Choosing a Recipe elsewhere (pinning it) always works, as above.

3. **Score** each candidate. The weights come from the **Planner Style** preset (table below). They stay internal (in code and tests); the household only sets the slider (§3), and positions between anchors interpolate linearly. Terms:
   - per attending Member's **Favourite**, per **Dislike**;
   - **× perishable use**: the share of the Recipe's base-unit needs covered by projected lots that go off before the next time those lots could be used, which rewards spending what would spoil;
   - **× Ingredient Overlap**: the share of needs covered by remainders of packs already planned for purchase in the horizon (e.g. the 600 g left from a 1 kg chicken pack);
   - **× stock coverage**: the share of needs covered by projected Stock overall;
   - **Leftover fits later slot / wasted**: + if the Batch surplus would fit a later slot as a Leftover; − if it would be wasted (no slot fits before its Use-by);
   - **recency (per unit)**: weight × recentness, where recentness = 1 − min(days, 28) / 28 and days is the gap to the most recent fresh cook of that Recipe before the slot (never cooked → 0 recentness). The weight is negative, so recently cooked Recipes lose points;
   - **jitter**: ± a random amount, seeded per generation so that Regenerate gives a genuinely different plan.

   | Weight | Use what we have | Variety (default) | Favourites |
   |---|---|---|---|
   | per attending Member's Favourite | +2 | +2 | +5 |
   | per Dislike | −2 | −2 | −3 |
   | × perishable use | 6 | 3 | 2 |
   | × Ingredient Overlap | 3 | 1.5 | 1 |
   | × stock coverage | 2 | 0.75 | 0.5 |
   | Leftover fits later slot / wasted | +1 / −1 | +1 / −1 | +1 / −1 |
   | recency (per unit) | −0.25 | −1 | −0.25 |
   | jitter | ±0.5 | ±0.75 | ±0.5 |
4. **Pick** the top-scoring candidate. Batches = ceil(portions needed ÷ Yield). The surplus (Batches × Yield − portions needed) becomes a pending Leftover with its Use-by. Projected Stock is updated, and any shortfall is recorded as a planned purchase in pack units of the Product last bought for that Ingredient (at the chosen Shop if known). If no Product has been bought yet, exact amounts are assumed, with no pack remainder.
5. **Why chips** are the 1–3 largest positive score terms, phrased for people: "uses Monday's chicken", "Anna's favourite", "spinach goes off Thu", "Slot Rule: Friday", "leftover from Tue".

If no candidate survives, the slot stays empty with a recorded reason (§7.4). The planner's reasons are `no_attendance` and `no_candidates` (with the counts removed by Exclusion, Cool-down, Variety Rule and Advance Step, and whether a Slot Rule claimed the slot); they are unchanged.

### 7.4 Couldn't plan (what the Household sees)
A slot the planner left empty is something to set up or a conflict between rules, not an error. Today, the Plan and the kitchen board show it as a designed state:

- **Grouped by cause, never one line per slot.** Each cause is one compact tile: "Couldn't plan 9 Meal Slots. Nobody is set to attend." The affected Meal Slots are a short summary ("Every dinner this week, plus weekend breakfasts") with a "Show all 9" control that lists each one. "Every" is measured only over slots that still count (a Planned Meal or a recorded reason): a slot whose time has gone is not part of the week. A Household with several causes sees one tile per cause.
- **One fix action per cause**, a button that goes where the cause is fixed:

  | Cause | Shown when | Tone | Fix action |
  |---|---|---|---|
  | Nobody attends | reason `no_attendance` | info | **Choose who attends** (Meal Slots, Attendance) |
  | No Recipes | `no_candidates` and no Recipe was considered | info | **Add Recipes** |
  | Slot Rule unmet | `no_candidates` and a Slot Rule claimed the slot | warn | **Review Slot Rules** |
  | Excluded | most options removed by an Exclusion | warn | **Review Exclusions** (Recipes: Exclusions are set per Recipe and Ingredient) |
  | Cool-down | most options removed by Cool-down | warn | **Review Cool-down** |
  | Variety Rule | most options removed by a Variety Rule | warn | **Review Variety Rules** |
  | Advance Step too late | most options removed by an Advance Step | warn | **Choose a Recipe** (pin one by hand) |
  | No fit | `no_candidates` with nothing counted | warn | **Choose a Recipe** |

  A slot is filed under one cause: the filter that removed the most options (ties: Exclusion, Cool-down, Variety Rule, Advance Step).
- **Tone.** Missing setup and rule conflicts use the info and warn tones with an icon, never the danger colour; danger is for real failures (a request that failed, spoiled food).
- **On Plan** the grouped notice sits at the top and each affected day tile shows a small inline "Not planned" chip with the cause. **On Today** the notice is a tile in the grid. **On the board** (read-only) an unplanned slot tomorrow shows "Not planned"; there is no action.
- **First run.** While the Household is new and nothing can be planned (no Planned Meal and a setup step missing), Today shows a setup checklist instead of Couldn't plan: **Members**, then **Meal Slots and attendance**, then **Recipes**, then the first plan ("1 of 4 steps set up"). It goes away once a Planned Meal exists.
  - **Exception (accepted at review).** When Members and Recipes exist and only attendance is missing, the checklist is not shown: Today shows Couldn't plan ("Nobody is set to attend", with **Choose who attends**), which names the missing step and fixes it directly. This is part of the checklist's visibility rule (one rule, so the tile and the Today layout cannot disagree).
- **Who can fix it.** Fixes that lead to an Admin-only page (Choose who attends, Review Cool-down, and the Members and Meal Slots checklist steps) are not offered to a plain User; the tile says "Ask an Admin".
- **After an upgrade.** Migration 1230 gives existing slots their attendees, but reasons recorded earlier would stay until the next replan, so the planner replans once at every startup (reason: Startup) and clears them.

### 7.3 Swap
**Swap** shows the top 3 alternatives under the same scoring (excluding the current Recipe and any Recipe reserved for a later Slot Rule slot, §7.2), each with its why chips. Choosing one pins it and replans the downstream unpinned slots, because Leftovers and Overlap may change.

## 8. Cooked and Leftovers

- **Mark as Cooked** (from Cook Mode, Today or the Plan) shows the proposed Leftover portions (Batches × Yield − Attendance need), which the User can edit with a ± control. Confirming:
  1. deducts Stock (§6);
  2. records the actual Leftover with its Use-by = cooked date + the Use-by days;
  3. replans: if the actual Leftover is smaller than what was already placed, the affected Leftover meals are unpinned and replanned; if it is larger, the extra becomes a pending Leftover.
- **Not cooked** ("we had takeaway") marks the meal as skipped: no Stock change and no Leftovers, and the Leftover meals that depended on it are replanned.
- A Planned Meal served from a Leftover that is due today offers **Reheat** on Today. Reheat opens a screen with a reheating timer scoped to that Planned Meal. The timer starts at the Recipe's Reheat time when it has one; otherwise at 2 minutes for one portion plus 1 minute for each further portion, at most 10 minutes. Either start is adjustable by 30 seconds, from 30 seconds to 30 minutes. Mark as Cooked then takes the portions off the Leftover and leaves Stock unchanged (Stock was deducted when the Batch was Cooked); like any Cooked or Not cooked, it cancels the Planned Meal's timers, the Reheat timer included. Leaving the screen early keeps the timer running and consumes nothing.
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
4. A toast shows "Passata +700 g · $1.59 ✎ · Undo". The price is prefilled from the last Price at this Shop. Tapping ✎ edits it, and leaving it as is confirms it. Undo reverses steps 1–3.
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

- **Cook Mode** opens for a Planned Meal (or a Recipe with a chosen Batch count). Steps are shown one at a time, with the `uses` amounts scaled to the Batches. Completed Advance Steps are listed above as done; ones not done show a warning. A Planned Meal served from a Leftover has no Steps and does not open Cook Mode; it uses Reheat (section 8).
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
| Access Request | when someone asks to sign in (deferred out of quiet hours) |

Notifications are suppressed during quiet hours (except timers) and deferred to the end of the quiet window.

## 13. Import and export

- **Export:** pick one or more Recipes, or all of them, and download a `.feeder.json` file with images embedded ([recipe-file.md](recipe-file.md)).
- **Import:** upload or paste JSON, then go through Import Review (recipe-file.md, *Import Review*).
- A Recipe's Reheat time travels in the Recipe File as the optional `reheatMinutes`; files without it stay valid (the format is still version 1).
- An Ingredient's picture travels in the Recipe File as the optional `image` of its definition (a data URL on export, a data URL or https URL on import, handled like a Recipe photo); files without it stay valid (still version 1). Import creates the picture only for an Ingredient it **creates**; it never changes an Ingredient the Household already has. A picture that cannot be fetched is dropped with an `image_failed` warning at `$.ingredients[i].image`. Member photos are not part of a Recipe File.
- **One image path.** Every image field (Recipe photo, Step photo, Ingredient picture, Member photo) uses the same image picker and the same server endpoints (`/api/images`); a scripted guard (`image-input` in `scripts/check-ui.sh`) fails the build when a screen builds its own image input. The nightly clean-up keeps every image that a Recipe, Step, Ingredient or Member uses (§15, decision 25).
- **Copy Agent Prompt:** copies the prompt template with the schema and example inlined.

## 14. Theming and layout

- Each User sets light, dark or system mode, an accent colour, plus metric (default) or imperial display. Imperial is a UI conversion only: metric Base Units (g, ml or piece) stay as stored and all stored values remain metric; it shows oz/lb and fl oz/cups/spoons where sensible. The palette is derived from the accent (tinted surfaces, tonal steps) with automatic WCAG AA contrast checks. Status colours (spoil, leftover) are fixed and not derived from the accent.
- Layout: Bento, as in the ux-brief. Phone uses a bottom bar (Today · Plan · Scan · Shop · Recipes; "Shop" there is a UI label for the shopping screen, not the glossary **Shop**); desktop uses a side rail with a wider grid; the tablet board is a separate route.
- `prefers-reduced-motion` turns off springs and the celebration animations.

## 15. Resolved decisions (2026-11-09)

1. `FEEDER_ADMIN_EMAIL` is mandatory; the container refuses to start without it, and it seeds the first Admin (§2).
2. Sessions: HTTP-only SameSite=Lax cookie, 30-day sliding expiry; removing a User from the allowlist ends their sessions immediately (§2).
3. A price-valued Weight Barcode Rule derives the weight from the Product's last known price per kg at that Shop; with no price history, the user is asked for the weight once (§5).
4. Mark as Cooked never blocks; short Stock triggers a warning with a one-tap Stock correction, and dismissing floors Stock at 0 (§6, §8).
5. Superseded by 15.
6. Both the recency preference and the seeded ±jitter stay (§7.2).
7. Planned purchases use the pack size of the Product last bought (at the chosen Shop if known); with none bought, exact amounts and no remainder (§7.2, §9).
8. A successful scan gives a beep and a haptic buzz, with a per-device mute; iOS Safari relies on the beep (§10.1).
9. Barcode formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR and DataMatrix; GS1 Digital Link URLs are read for their GTIN, other QR content is ignored (§10.4).
10. The kitchen board goes dark at local sunset and light at sunrise from an Admin-set household Location, falling back to 19:00–07:00 (§3, §11).
11. Weight Barcode Rules configure their value's unit: weight in g (default), kg, oz or lb; price in the currency's minor unit. Decoded value = digits ÷ 10^decimal places. Internally everything is in metric Base Units (g, ml or piece) and price per kg (§5).
12. Currency is an Admin-managed household setting, default USD; examples use $ (§3, §10.1).
13. Each User can choose metric (default) or imperial display; UI conversion only, stored values stay metric (§14).
14. A Leftover may fill a Slot Rule's slot if its Recipe satisfies the rule (the named Recipe or one of its Tags); otherwise the Slot Rule wins (§7.2).
15. Planner Style presets are the table in §7.2; the default is the middle anchor "Variety"; positions between anchors interpolate linearly (§3, §7.2).
16. Stock "Keep" pushes the go-off date out by 1 day from the existing go-off date (§6).
17. Variety Rule "per week" is the ISO week, Monday to Sunday; Leftovers don't count towards Variety Rules (§7.2).
18. The phone bottom-bar item "Shop" is a UI label for the shopping screen (Shopping List plus scanning), not the glossary **Shop** (§14).
19. The Google sign-in redirect URI is `<FEEDER_BASE_URL>/auth/google/callback` (§2).
20. (2026-11-10) The per-User optional secondary colour is removed: a User's palette is derived from the accent alone. The Preferences API ignores a `secondary` field sent by an old client and never returns it, and the stored column is dropped (§14).
21. (2026-11-10) A bought Product cannot be deleted but can be archived and unarchived; archived Products are left out of lists and pickers, unknown to Scans, never suggested as last bought, and keep their history and barcodes (a new Product cannot claim them: unarchive the owner) (§5).
22. (2026-11-10) Slot Rule reservation: the planner keeps a Slot Rule's Recipe for its slot and does not place it on earlier slots where its Cool-down would block the rule's slot ("Friday dinner = pizza" never lands on Tuesday). It applies to a Recipe rule, and to a Tag rule when exactly one eligible Recipe carries the Tag; the window is the Recipe's Cool-down, and it also replans unpinned Planned Meals inside it. Pinned always wins, and the rule slot then shows its usual couldn't-plan reason. Swap does not offer the reserved Recipe on those earlier slots (§7.2, §7.3).
23. (2026-11-10) Attendance defaults to everyone: a new Meal Slot includes all current Members, a new Member joins every existing Meal Slot, and people opt out; migration 1230 gives every existing slot with no attendees all Members, once and automatically (§3). Couldn't plan is a designed state grouped by cause, with a setup checklist on first run (§7.4).
24. (2026-11-10) Sign-in needs approval by any User or a pre-added address (ADR 0005); defaults: one approval, 14-day expiry, 24 h deny cool-down (§2).
25. (2026-11-10) Meal Slots can be edited on several weekdays at once: the change applies to the Matching Meal Slot (same name) on each chosen weekday, skipped days are reported, nothing is created, and the edit is atomic (`PATCH /api/meal-slots/batch`). Weekdays are chosen with the shared WeekdayPicker chips; the overview shows attendee pills and, from 1024 px, a week table (§3).
26. (2026-11-10) Pictures for Ingredients and Members (IM2): an Ingredient may have one picture and a Member one photo, both kept in the shared image store and by the nightly clean-up; a Member's avatar is photo, else emoji, else initials; every image field uses the one image picker (§3, §5, §13).
