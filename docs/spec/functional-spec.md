# Feeder: functional specification (v1)

Status: **draft for review** (2026-11-09). The terms in **bold** are defined in [GLOSSARY.md](../../GLOSSARY.md). Decisions behind this spec are in [docs/adr/](../adr/), and look and feel in [docs/design/ux-brief.md](../design/ux-brief.md) (direction: Bento). The open points raised while writing this spec were resolved on 2026-11-09 (§15).

## 1. Scope

**In v1:** Household setup; Recipes with timed Steps and images; Ingredients, Products and Shops; Stock tracked as Stock Lots; Courses per Meal Slot and Whole meal Recipes (§3.1); the automatic planner with Leftovers; the Shopping List; in-store and home scanning (offline-capable); Cook Mode; the kitchen board; Recipe File import/export and the Agent Prompt; Web Push reminders; per-User theming; Google sign-in; nightly backups; a Docker image published to GHCR.

**Out of v1:** multiple Households per instance; external product databases; nutrition; calendar (ICS) feeds; a freezer for Leftovers; receipt OCR; languages other than English (strings are externalised, so translations can be added later).

## 2. Users, roles and access

- Sign-in is Google OAuth only, and only for a verified Google email. A person signs in at once if their email is on the **allowlist** or is the email of a **Member**. Anyone else creates an **Access Request** and sees a "Waiting for approval" page, with no session and no access to any data. Any signed-in User can approve (adding a non-Admin User) or deny it; one approval is enough. A denied email may ask again after 24 hours; a request expires after 14 days. Requests are limited per IP (10 an hour), per email (3 a week) and in total (50 pending), and every approval, denial and expiry is recorded with who did it. Settings lists the pending requests, and a count badge shows on the avatar menu.
- The `FEEDER_ADMIN_EMAIL` environment variable is mandatory: the container refuses to start without it. It seeds the allowlist with the first **Admin**.
- **Admin** manages the allowlist, Members, Meal Slots, Courses, Weight Barcode Rules and household settings, and renames or deletes Shops. Every **User** can do everything else, including adding a Shop and saving its Shop Location (§5).
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

**Meal Slots** are defined per weekday. Each has a name (e.g. Lunch), a usual time, the ordered **Courses** it serves (at least one; §3.1) and a default **Attendance** (which Members attend, each with an optional Portion Factor override). The same slot name can exist on several weekdays with different times or attendance. A one-off change for a specific date ("Sam is away Thursday") edits that date's Attendance only.

**Editing a Meal Slot on several days** (R15, ui-review-2 §3.7). The Meal Slot editor has an "Apply to" choice of weekdays (seven toggle chips, Monday first, plus the quick picks "All days with <name>", "Weekdays" and "Weekend"); it starts with the day being edited. The change (name, usual time, Courses, usual Attendance; only the fields the Admin changed) applies to the **Matching Meal Slot** on each chosen weekday: the Meal Slot with the same name. A chosen weekday without one is **skipped** (nothing is created). Before saving the editor lists what will happen ("Update Dinner on Mon, Tue, Wed", "Thu skipped: no Dinner"); after saving it says it again ("Updated Dinner on Mon, Tue, Thu. Wed has no Dinner, so it was skipped."). The edit is **all or nothing**: if any matching Meal Slot cannot take the change (for example a rename that clashes with a Meal Slot already on that weekday), none is changed. Adding a Meal Slot uses the same weekday chips. Editing no longer moves a Meal Slot to another weekday: add it there and remove the old one.

**The Meal Slots overview shows who attends.** Each Meal Slot shows its Attendance as Member pills (Member colour, avatar or initials, first name), four at most and "+N" for the rest. A Meal Slot nobody attends shows a "Nobody attending" warning pill that leads to choosing who attends. From 1024 px wide the overview is a week table (days as columns, Meal Slot names as rows). Every Meal Slot has an anchor (`/settings/meal-slots#meal-slot-<id>`), which Couldn't plan uses for "Choose who attends".

**Attendance defaults to everyone** (R13, decision 23). A new Meal Slot includes every current Member as attending, each at their own Portion Factor (no override), unless the request names an Attendance explicitly (an explicit empty list means nobody, a deliberate choice). A new Member is added to every existing Meal Slot's usual Attendance, including slots that were left empty. People opt out, in the Meal Slots editor (usual Attendance) or for one date (Date Attendance). Date Attendance overrides are never touched by adding a Member: a date the Household already edited keeps its list. Deleting a Member still removes them from every Attendance. When an existing install is upgraded, a one-off migration gives every Meal Slot that has no attendees all current Members (§15, decision 23); it runs once, automatically, and slots that already have attendees are left alone.

**Portions needed** for a slot = the sum of the Portion Factors of the attending Members. Attendance belongs to the Meal Slot, not to a Course: each Course the slot serves needs these same portions, and each Course's Recipe cooks its own Batches for them (a Recipe's Yield is in its own standard portions, so a Side's Yield counts Side portions).

### 3.1 Courses

A **Course** is one part of what a Meal Slot serves, filled by one Recipe ([ADR 0008](../adr/0008-courses.md)). The Household defines its own Courses, in an order, and flags one as the **main Course**.

- **The list.** Each Course has a name (1 to 40 characters, unique with case, accents and spacing ignored, as Tags are matched), a position in the household order, the main flag on exactly one Course, and an archived state. At most 20 Courses are in the list (archived ones do not count). A new install, and an upgraded one, starts with **Main** (main), **Side**, **Starter** and **Dessert**, in that order.
- **What the order is for.** The household order is the order of Course chips in every picker and of a Recipe's Courses wherever they are shown. A Meal Slot keeps its own order for what it serves (Dinner = Main, Side), which is the order the Courses appear in on Today, the Plan, the board and in Cook Mode.
- **Settings > Courses** (Admin edits; every User may open it read-only), route `/settings/courses`, linked from the Settings index next to Meal Slots. One row per Course in household order: a drag handle (the shared Sortable, with keyboard moves), the name, a "Main" chip on the main Course, and what uses it ("12 Recipes · 5 Meal Slots"). Each row has an actions menu: **Rename** (inline, the same validation as adding), **Make main** (not on the main Course; moves the flag in one step, nothing else changes) and **Delete**. An **Add Course** field ends the list. Archived Courses sit in a collapsed "Archived Courses" section with **Unarchive**.
- **Delete** opens a crafted dialog. It names what changes: "Side is on 12 Recipes and 5 Meal Slots." It asks for a **replacement Course** (the shared Course select, default the main Course) for the Recipes and Meal Slots that have no other Course ("3 Recipes and 2 Meal Slots have only Side: give them Main"). It lists what goes: Planned Meals in that Course from today on (Pinned ones by date and Recipe) and Slot Rules on that Course. Then:
  - the main Course cannot be removed (`409 course_main`; in the menu, Delete says "Make another Course main first"), and nor can the last Course;
  - Delete is refused for a Course that any Planned Meal or Leftover has ever used (`409 course_planned`); the dialog then offers **Archive**, with the same replacement and the same list. An archived Course leaves the list and every picker, is taken off every Recipe, Meal Slot and Slot Rule, and is ignored by the planner; Planned Meals and Leftovers keep it and show its name in history. **Unarchive** puts it back in the list, last, without restoring it to any Recipe or Meal Slot;
  - a Course that was not planned is removed for good;
  - in both cases unresolved Planned Meals in that Course from today on are removed and the horizon is replanned, all in one transaction.
- **Rename** keeps every reference (all records point at the Course id). Renaming the main Course keeps its flag. A name already used is `409 course_name_taken`.
- **A Meal Slot's Courses.** The Meal Slot editor has a **Courses** field: the shared ordered Course picker. It shows the household's Courses as toggle chips (household order); the chosen ones are listed below in the slot's order, each with a drag handle and keyboard moves (Move up, Move down). At least one is required ("Choose at least one Course"); the main Course is not required. A new Meal Slot starts with the main Course. With the multi-day edit (R15) the Courses are one of the fields applied to each Matching Meal Slot, and only when the Admin changed them; the preview names removals ("Removes Side from Tue and Thu: 3 Planned Meals and 1 Slot Rule go"). Taking a Course off a Meal Slot removes that slot's unresolved Planned Meals in that Course from today on (Pinned ones are listed before saving), its Slot Rules on that Course and its Couldn't plan reasons for that Course, then replans; adding a Course replans to fill it. Cooked and Not cooked Planned Meals stay as history and still show on their date. The Meal Slots overview shows each slot's Courses under its name ("Main · Side").
- **A Recipe's Courses** are set in the Recipe editor (§4). A Recipe has at least one Course.
- **Upgrade.** Migration 1400 seeds the four Courses, gives every existing Recipe and Meal Slot the main Course only, puts every existing Planned Meal, Leftover, Couldn't plan reason and Slot Rule in the main Course, and marks every existing Ready Meal as a Whole meal (§4). It changes nothing else, so an upgraded Household plans exactly as before until it adds Courses.

## 4. Recipes

These fields mirror the Recipe File ([recipe-file.md](recipe-file.md)): name, description, **Yield**, Ready Meal flag, **Courses** (one or more), **Whole meal** flag, **Tags**, Cool-down and Use-by overrides, **Reheat time** (optional, 1 to 30 whole minutes), image, source, ingredient lines (for one **Batch**) and **Steps** (active, passive or **Advance Step**, with an optional duration, image, `after` dependencies and `uses`).

- **Total time** is the critical path of the schedule (recipe-file.md, *Steps and timing*), shown on Recipe tiles. Advance Steps show separately ("+4 h marinate").
- Recipes can be **archived**: they are excluded from planning but kept for history. Hard delete is only possible if the Recipe was never planned.
- A Recipe's **Reheat time** is optional. It is a whole number of minutes from 1 to 30; blank means not set. The Recipe editor shows it as a compact number field after the Use-by field. It is flat for the Planned Meal (it does not grow with the number of portions) and Reheat clamps it to its own 30 seconds to 30 minutes range. A value outside 1 to 30 is refused with `validation_failed`, `reason: reheat_invalid`, `field: reheatMinutes`.
- **Courses.** The Recipe editor has a **Courses** field after the Ready Meal switch: the shared Course picker in its unordered form (toggle chips in household order). At least one is required ("Choose at least one Course"); a new Recipe starts with the main Course. Recipe tiles and Recipe detail show the Courses as chips, and the Recipes list can be filtered by Course. The API takes `courseIds`; an empty list is `validation_failed`, `reason: courses_empty`, `field: courses`; an unknown or archived id is `reason: course_unknown`. A create without `courseIds` gets the main Course; an update without it keeps the Recipe's Courses.
- **Whole meal.** A switch, **Whole meal**, under Courses, with the helper "Planned as Main, it leaves the slot's other Courses empty" (naming the main Course). It is shown only while the Recipe's Courses include the main Course; otherwise it is not shown and the editor saves it off. The server keeps `wholeMeal` as sent; a create without it is `true` for a Ready Meal whose Courses include the main Course and `false` otherwise, and an update without it keeps the stored value. Moving the main flag to another Course changes no Recipe: a Whole meal Recipe covers only where it is planned in the main Course (§7.2).
- **Ready Meal and Whole meal.** Marking a Recipe as a Ready Meal switches Whole meal on when its Courses include the main Course, unless the User already set Whole meal in this edit; the User can switch it off (a bought dessert or side). Unmarking a Ready Meal leaves Whole meal as it is. A Ready Meal is never Whole meal by rule, only by this default.
- Recipe editor: an ingredient line's unit is validated against the Ingredient's units, and an unknown unit prompts for a **Unit Conversion** inline.
- **Creating an Ingredient from a line.** The Ingredient picker of an ingredient line offers "Create Ingredient '<typed name>'" as its last option when the typed name matches no Ingredient exactly (case, accents and spacing ignored). It opens the New Ingredient sheet over the editor with the name filled in; the Recipe draft is kept untouched, with no navigation. Before creating, Feeder asks "Did you mean Garlic?" for a near match, using the same matching as Import Review, and offers to use the existing Ingredient. Saving creates the Ingredient, selects it on that line and puts focus in the line's quantity. A unit already on the line stays; if it is not convertible for the new Ingredient the usual inline **Unit Conversion** prompt follows on save. The Recipe editor needs a connection to save, so offline the option is shown disabled with the reason "Needs a connection to create an Ingredient".
- **A Ready Meal and its Ingredient.** Feeder keeps an Ingredient with the Recipe's name so the pack can be stocked and bought. Marking a Recipe as a Ready Meal puts that Ingredient on its one line: an existing Ingredient with the same name (case and spacing ignored) is used, never duplicated; otherwise one is created on save, with Base Unit piece and no Shelf Life. The line is 1 piece (an existing same-name Ingredient counted in g or ml is selected with its Base Unit and the quantity left for the User, as Feeder never invents a pack size). The editor says "Feeder adds an Ingredient called '<name>' so you can stock and buy it". The line follows the name until the User edits it. Renaming a saved Ready Meal offers to rename its Ingredient too (never done silently, and not offered if another Ingredient already has the new name). Unmarking a Ready Meal keeps its Ingredient and its line, which become ordinary and editable; a line that was only pending (nothing created yet) is dropped. The API takes a Ready Meal with no lines as "make the pack line": it applies the same rule, in the same transaction as the Recipe, and answers `validation_failed`, `field: lines`, `reason: ready_meal_unit` when the same-name Ingredient is counted in g or ml.

## 5. Ingredients, Products, Shops

**Ingredient**: a name, **Base Unit**, Unit Conversions, an optional **Shelf Life** and an optional **picture**. Renaming an Ingredient keeps all its references. Two Ingredients can be merged (references move, conversions combine, and conflicts are shown).

The **New Ingredient** sheet asks for a name, a Base Unit (g, ml or piece, g unless a Recipe line or Scan already gave a unit) and an optional Shelf Life in days; the sheet also has an optional **Picture** (the shared image picker, 4:3 crop); everything else (Unit Conversions) is edited on the Ingredient's page, whose Picture Tile can add, replace, crop or remove it at any time, even while the Ingredient is in use (only the Base Unit locks). The Ingredients list shows the picture as a small thumbnail. A picture is stored as an image id (`image`, with the read-only `imageUrl`); replacing or removing it, merging the Ingredient away or deleting it removes the old file. When two Ingredients merge, the survivor keeps its own picture, or takes the merged-away Ingredient's when it has none. It validates inline instead of disabling its button, and asks "Did you mean ...?" before creating a name close to an existing Ingredient. It is opened from the Ingredients screen, from an ingredient line of the Recipe editor, and from the "what is this?" form.

**Product**: a name, the Ingredient it supplies, its pack size (in the Ingredient's Base Unit), optional global barcodes (EAN/UPC) and the Shops known to sell it. Products are created only through the "what is this?" form during scanning, or from an Ingredient's page.

A Product may also have one optional **Picture** (the same word as an Ingredient's; GLOSSARY: Photo), so a person in the shop can tell "Mutti passata" from "own-brand passata" at a glance. It is added with the shared image picker (4:3 crop) in three places: the **Product sheet** (the form that creates a Product from an Ingredient's page), the **Picture Tile** on the Product page (first Tile; it saves at once and may be changed or removed at any time, also while the Product is bought or archived) and the "what is this?" sheet (§10.1, also when the phone is offline). A scan that merges into an existing Product (§10.3) gives it the form's Picture only if the Product has none, and never replaces one. It is shown as a small thumbnail at the start of every Product row (the Products screen and an Ingredient's Products list) and of the scan line (§10.1); rows without a Picture keep the same empty slot so the names line up. A Picture is stored as an image id (`image`, with the read-only `imageUrl`, both always sent, `""` when none); `POST /api/products` takes `image`, and `PATCH /api/products/{id}` takes it presence-aware (absent keeps it, `""` removes it, an id sets it). An id that is malformed or was never uploaded is `400 invalid_product` on field `image`. Replacing or removing the Picture, or deleting the Product, removes the old file unless some other record still uses it; archiving keeps it. The nightly clean-up keeps every Product Picture (§13, §15).

**Shop**: a name. It has:
- **Shop Barcodes**: a code mapped to a Product, valid only in that Shop;
- **Weight Barcode Rules**: a barcode prefix (e.g. `21`), the digit positions of the item code, the digit positions of the value, whether the value is a weight or a price, its unit, and the decimal places. The unit is configured per rule: for a weight, g (default), kg, oz or lb; for a price, the household currency's minor unit (cents by default). The decoded value = digits ÷ 10^decimal places, in that unit. Internally all quantities are stored in metric Base Units (g, ml or piece) and price per weight is kept per kg. When the value is a price, the weight is derived from that Product's last known price per kg at that Shop. If there is no **Price** history, the app asks the user for the weight once, which also records the price per kg for next time;
- **Prices**: a Price for a Product at a Shop on a date. The latest one prefills the next scan.
- an optional **Shop Location**: where the Shop is (latitude and longitude, WGS84). It lets the phone pick the Shop the User is standing in.

**Adding a Shop.** Any User adds a Shop, from Settings, from the Shop select on the Shop screen ("Add Shop "Lidl"" for what was typed) or from the Scan picker ("Add the Shop I am in"). The User is assumed to be in the Shop: the **Add Shop** sheet asks the phone for its position as it opens and offers it with a switch, on by default, "Save this spot as the Shop's location". A fix less precise than 150 m is not offered ("too rough to save"); with location off or unavailable the Shop is added without one, and "Try again" is offered where a retry can help. Any User can also **Save my current location** on a Shop's page, which replaces the Shop Location. Only the Admin renames or deletes a Shop. `POST /api/shops` takes an optional `location: {lat, lon}`, `PUT /api/shops/{id}/location` saves one, and every Shop carries `location` (null when not saved); a latitude outside −90…90 or a longitude outside −180…180 is `400 invalid_shop`.

**Nearest Shop.** The phone compares its position with the Shop Locations; the nearest Shop within 200 m plus the fix's accuracy (at most 1 km) is the Shop the User is **in**. The position is asked for at once only where the browser already allows it (no prompt on load); otherwise only on a tap of **Find the Shop I am in**. The phone's position is never stored or sent; only a Shop Location the User chose to save reaches the server.
- **Scan picker** (§10.1): that Shop is listed first, marked "You are here · 40 m". A Scan session that started by itself with the last Shop used, while the phone is at another saved Shop, shows "You seem to be at Coop (40 m)." with **Switch to Coop**.
- **Shop screen** (§9): that Shop becomes the Shop the list is priced at, with a toast "Priced at Coop: you are 40 m away" and **Undo**. A tap away from every saved Shop says "No saved Shop is near you" and offers **Add it**.

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
- **Storage Places** (the Pantry page). The Household keeps Stock in Storage Places such as Kitchen Pantry, Garage Fridge or Garage Freezer, each of one kind: pantry, fridge or freezer. Any User adds, renames, re-kinds and deletes them in Settings > Storage Places; one may be the **default**. A Stock Lot is in one Storage Place or **not sorted**; deleting a Storage Place leaves its Lots in Stock, not sorted.
  - **Where new Lots go.** A new Lot (scan, Stock-take increase or manual add) goes where that Ingredient was last put (the remembered place), else to the default Storage Place, else nowhere. A manual add may name a Storage Place, which then becomes the remembered one.
  - **Frozen Shelf Life.** An Ingredient may have a **frozen Shelf Life** (1 to 3650 days). A Lot added straight into a Freezer goes off at purchase date + the frozen Shelf Life. **Moving** a Lot into a Freezer (from any other kind, or from not sorted) sets its go-off date to today + the frozen Shelf Life; moving it out of a Freezer sets it to today + the ordinary Shelf Life. Without the Shelf Life that applies, the go-off date is unchanged, and so is any move between non-freezer kinds. Changing a Storage Place's kind moves no go-off date.
  - **Moving.** A Lot, or part of it, moves to another Storage Place (`POST /api/stock/lots/{id}/move` with `storagePlaceId` and an optional `quantity`); a part splits the Lot, the rest staying where it was with its go-off date. More than the Lot holds is refused.
  - **The Pantry page** (avatar menu "Pantry", routes `/stock` and `/pantry`). By default it lists every Stock Lot grouped by Storage Place (by name, "Not sorted" last), each row "1000 g · Good until Thu" with the Ingredient's Picture. Filters: search, All / Use soon / Spoiled, Storage Places (several, including Not sorted) and kinds; sort by good until (default), name, quantity, bought (newest) or Storage Place; a switch turns the grouping off (then each row names its place). "By Ingredient" shows the per-Ingredient totals as before; the device remembers the choice. Tapping a Lot opens it: its facts, **Move to** (a Storage Place and how much) with a note when the Freezer changes its go-off date, and the Ingredient's own sheet.
- **Stock-take** sets an Ingredient's total. A decrease removes quantity from the soonest-to-spoil lots first. An increase adds a new lot dated today.
- Lots past their go-off date are listed as **spoiled** on Today ("Throw out or keep?"). "Throw out" removes the lot and records the waste. "Keep" pushes the lot's go-off date out by 1 day from its existing go-off date (not from today) and records the day it was chosen. Both feed the zero-waste streak (below). Throw out and Keep are offered only for a Lot that has gone off.

### 6.1 Zero-waste streak
The streak is the number of whole household days (household time zone, §3) since the last **waste event**, never more than the Household's age. It is shown on Today and on the Kitchen board (§11); both show the same number.

- **Go-off day.** A Lot is still fine on its go-off date; it **goes off** on the next household day (go-off date + 1), the first day it is listed as spoiled. A Lot with no go-off date never goes off.
- **Wording (GW).** Copy before the Lot has gone off names the last good day, the go-off date: "Good until today", "Good until tomorrow", "Good until Thu" (two to six days ahead; "Good until 20 Nov" from seven days ahead). This applies to Stock rows and Stock Lot chips, the Today Use soon tile ("Spinach · good until Thu") and the Stock about to spoil notification. Once the Lot has gone off, copy says "Went off today" (go-off date yesterday), "Went off yesterday", "Went off N days ago". Never write "goes off" for the go-off date itself.
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
- Immediately after any change that invalidates a plan: a Recipe edited or archived (its Courses and Whole meal flag included), Attendance changed, a Meal Slot's Courses changed, a Course archived or removed, the main flag moved to another Course, a Planned Meal unpinned, a Cooked confirmation that changes the Leftover count, or a Stock-take.
- On demand: **Regenerate** redoes every unpinned, uncooked Planned Meal in the horizon.

It never changes **Pinned** or **Cooked** Planned Meals. A Planned Meal becomes Pinned when a User sets, swaps or confirms it.

### 7.2 Algorithm
The planner walks the empty **cells** in order, keeping a **projected Stock** (current lots, plus planned purchases, minus planned consumption) and a list of **pending Leftovers**. A cell is one Course of one Meal Slot on one date, the key of a Planned Meal: `(date, Meal Slot, Course)` ([ADR 0008](../adr/0008-courses.md)). Slots are taken in chronological order; within a slot, the **main Course** comes first when the slot serves it (it decides covering), then the slot's other Courses in the slot's order. Everything below that says "slot" for a Planned Meal means its cell.

For each cell:
0. **Covered.** If the slot's main Course on this date holds a Planned Meal (any state, fresh or from a Leftover) whose Recipe is a **Whole meal**, every other Course of the slot is **covered**: the planner leaves it empty, removes an unpinned, uncooked Planned Meal there, and records no Couldn't plan reason. A Pinned, Cooked or Not cooked Planned Meal in a covered Course stays as it is. A slot that does not serve the main Course is never covered.
1. **Leftover first.** Take the pending Leftovers whose Recipe is marked with the cell's Course (**Course fit**), that fully cover the slot's portions, are still before their Use-by, and have no attending Member with an Exclusion on that Recipe or its Ingredients. A Leftover is not tied to the Course it was cooked in: a soup cooked as Monday's Main may be Wednesday's Starter. If one exists and no Slot Rule claims the slot, place the one with the soonest Use-by. A Leftover may also fill a slot claimed by a Slot Rule if the Leftover's Recipe satisfies that rule (it is the named Recipe, or carries the Tag the rule names); otherwise the Slot Rule wins. Among several such Leftovers, the one with the soonest Use-by is placed. Dislikes are ignored for Leftovers.
2. **Candidates.** Start from the non-archived Recipes marked with the cell's Course (**Course fit**), or only those of them a Slot Rule on this cell's Course names (by Recipe or Tag). If no non-archived Recipe is marked with the Course at all, the cell stays empty with reason `no_course_recipes`. Remove any that:
   - are already planned in another Course of the same slot on the same date (one Recipe fills at most one Course of a slot);
   - are a **Whole meal**, when the cell is the main Course and another Course of the slot on this date holds a Pinned, Cooked or Not cooked Planned Meal (the User's choice there wins, so the planner does not cover it);
   - have an Exclusion for an attending Member (on the Recipe or any of its Ingredients);
   - fall within their Cool-down (counted from the last planned or cooked date, in any Course);
   - would break a Variety Rule ("per week" means the ISO week, Monday to Sunday; every Course counts, so a fish Starter and a fish Main on one day are two; Leftovers don't count towards Variety Rules);
   - have an Advance Step whose lead time has already passed for this slot.
   - are **reserved** for a later Slot Rule slot (see *Slot Rule reservation* below).
**Slot Rule reservation.** A Slot Rule's Recipe is kept for its cell. While the planner walks an earlier cell, it removes a Recipe R from the candidates if R is *reserved* for a later cell S and placing R here would put S inside R's Cool-down (the gap in days between the two cells is less than R's Cool-down; cells on the same day, and other Courses of the same slot, count as a gap of 0). S is a cell: the Meal Slot on a date and the Course the rule targets. A covered cell is not open, so it reserves nothing.
- **Which reservations exist.** S reserves R when S has a Slot Rule and R is the only Recipe it can still take: the rule names R directly, or the rules' Recipes and Tags together match exactly one eligible Recipe (not archived, marked with S's Course, no Exclusion for a Member attending S). When several eligible Recipes match (a Tag carried by two Recipes), nothing is reserved, because the others can fill S. S must still be open: a Pinned, Cooked or skipped meal in S reserves nothing. An unpinned Planned (kept) meal in S counts as open: it is replaced if the rule calls for it, so it still reserves.
- **Window.** The Cool-down of R before S, anywhere in the Planning Horizon, including slots whose meal Plan would otherwise keep: an unpinned Planned Meal of R inside the window is replanned, and its slot takes another Recipe. Regenerate behaves the same.
- **Pinned wins.** A Pinned or Cooked meal of R (or a cook before the horizon) already inside S's Cool-down makes the rule unmeetable, so no reservation is made: nothing else is held back, and S stays empty with its usual reason ("Couldn't plan Friday dinner: every option was excluded or in cool-down."). If two open Slot Rule slots reserve the same Recipe inside each other's Cool-down, the earlier slot keeps it and the later one stays empty.
- **Swap.** Swap applies the reservation too: it does not offer R as an alternative for a slot where it would block S. For S itself Swap still ignores the Slot Rule (§7.3). Choosing a Recipe elsewhere (pinning it) always works, as above.

3. **Score** each candidate. The weights come from the **Planner Style** preset (table below). They stay internal (in code and tests); the household only sets the slider (§3), and positions between anchors interpolate linearly. Terms:
   - per attending Member's **Favourite**, per **Dislike**;
   - **× perishable use**: the share of the Recipe's base-unit needs covered by projected lots that go off before the next time those lots could be used, which rewards spending what would spoil;
   - **× Ingredient Overlap**: the share of needs covered by remainders of packs already planned for purchase in the horizon (e.g. the 600 g left from a 1 kg chicken pack);
   - **× stock coverage**: the share of needs covered by projected Stock overall;
   - **Leftover fits later slot / wasted**: + if the Batch surplus would fit a later cell as a Leftover (a Course the Recipe is marked with); − if it would be wasted (no cell fits before its Use-by);
   - **recency (per unit)**: weight × recentness, where recentness = 1 − min(days, 28) / 28 and days is the gap to the most recent fresh cook of that Recipe before the slot, in any Course (never cooked → 0 recentness). The weight is negative, so recently cooked Recipes lose points;
   - **jitter**: ± a random amount, seeded per generation and per cell (the Course is part of the seed) so that Regenerate gives a genuinely different plan.

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
5. **Why chips** are the 1–3 largest positive score terms, phrased for people: "uses Monday's chicken", "Anna's favourite", "uses spinach by Thu" (the go-off date is the last good day), "Slot Rule: Friday", "leftover from Tue".

If no candidate survives, the cell stays empty with a recorded reason (§7.4), keyed by date, Meal Slot and Course. The planner's reasons are `no_attendance`, `no_course_recipes` (new: no non-archived Recipe is marked with the cell's Course) and `no_candidates` (with the counts removed by Exclusion, Cool-down, Variety Rule and Advance Step, and whether a Slot Rule claimed the cell). `no_attendance` is recorded for each Course of a slot nobody attends.

**Courses in the planner, in short** (decision 29):

| Question | Rule |
|---|---|
| Which Recipes may fill a Course? | Only Recipes marked with that Course, fresh or as a Leftover (Course fit). |
| Variety Rules, Cool-down, recency | Per Recipe, across Courses. One Recipe fills at most one Course of a slot on a date. |
| Slot Rules | Target one Course of a Meal Slot; the main Course unless the rule names another. A rule's Recipe must be marked with that Course. |
| Leftover first | Per cell, with Course fit on the Leftover's Recipe; not tied to the Course it was cooked in. |
| Reservations | Per cell (the rule's Course); other Courses of the same slot count as the same day. |
| Whole meal in the main Course | The slot's other Courses are covered on that date: not planned, not Couldn't plan. |
| Whole meal in another Course | An ordinary Recipe. |
| Attendance and portions | Per Meal Slot; every Course needs the slot's portions and cooks its own Batches. |
| No Recipe has the Course | Couldn't plan for that cell, cause "No Recipes for this Course" (§7.4). |
| Ingredient Overlap, projected Stock | Shared by all Courses: the walk order above decides which Course sees a remainder first. |

### 7.4 Couldn't plan (what the Household sees)
A Course of a slot the planner left empty is something to set up or a conflict between rules, not an error. Reasons are recorded per cell (date, Meal Slot, Course); a covered Course (§7.2, step 0) has none. Today, the Plan and the kitchen board show it as a designed state:

- **Grouped by cause, never one line per slot.** Each cause is one compact tile: "Couldn't plan 9 Meal Slots. Nobody is set to attend." The affected Meal Slots are a short summary ("Every dinner this week, plus weekend breakfasts") with a "Show all 9" control that lists each one. For a cause that hits only some Courses of a slot, the list and the summary name the Course ("Friday Dinner · Side", "Side at every dinner this week"); a slot whose every Course has the same cause is named once, without Courses. Counts are of Meal Slots when the cause is Nobody attends (Attendance is per slot) and of Courses otherwise ("Couldn't plan 5 Sides"). "Every" is measured only over slots that still count (a Planned Meal or a recorded reason): a slot whose time has gone is not part of the week. A Household with several causes sees one tile per cause.
- **One fix action per cause**, a button that goes where the cause is fixed:

  | Cause | Shown when | Tone | Fix action |
  |---|---|---|---|
  | Nobody attends | reason `no_attendance` | info | **Choose who attends** (Meal Slots, Attendance) |
  | No Recipes | `no_candidates` and no Recipe was considered | info | **Add Recipes** |
  | No Recipes for this Course | `no_course_recipes` | info | **Mark Recipes as Side** (the Recipes list, filtered to Recipes not marked with that Course; each Recipe is marked in its editor) |
  | Slot Rule unmet | `no_candidates` and a Slot Rule claimed the slot | warn | **Review Slot Rules** |
  | Excluded | most options removed by an Exclusion | warn | **Review Exclusions** (Recipes: Exclusions are set per Recipe and Ingredient) |
  | Cool-down | most options removed by Cool-down | warn | **Review Cool-down** |
  | Variety Rule | most options removed by a Variety Rule | warn | **Review Variety Rules** |
  | Advance Step too late | most options removed by an Advance Step | warn | **Choose a Recipe** (pin one by hand) |
  | No fit | `no_candidates` with nothing counted | warn | **Choose a Recipe** |

  A slot is filed under one cause: the filter that removed the most options (ties: Exclusion, Cool-down, Variety Rule, Advance Step).
- **Tone.** Missing setup and rule conflicts use the info and warn tones with an icon, never the danger colour; danger is for real failures (a request that failed, spoiled food).
- **On Plan** the grouped notice sits at the top and each affected day tile shows a small inline "Not planned" chip with the cause, on the Course's row. **On Today** the notice is a tile in the grid. **On the board** (read-only) an unplanned Course tomorrow shows "Not planned" on its row; there is no action.
- **First run.** While the Household is new and nothing can be planned (no Planned Meal and a setup step missing), Today shows a setup checklist instead of Couldn't plan: **Members**, then **Meal Slots and attendance**, then **Recipes**, then the first plan ("1 of 4 steps set up"). It goes away once a Planned Meal exists.
  - **Exception (accepted at review).** When Members and Recipes exist and only attendance is missing, the checklist is not shown: Today shows Couldn't plan ("Nobody is set to attend", with **Choose who attends**), which names the missing step and fixes it directly. This is part of the checklist's visibility rule (one rule, so the tile and the Today layout cannot disagree).
- **Who can fix it.** Fixes that lead to an Admin-only page (Choose who attends, Review Cool-down, and the Members and Meal Slots checklist steps) are not offered to a plain User; the tile says "Ask an Admin".
- **After an upgrade.** Migration 1230 gives existing slots their attendees, but reasons recorded earlier would stay until the next replan, so the planner replans once at every startup (reason: Startup) and clears them.

### 7.3 Swap
**Swap** works on one Course of a slot. It shows the top 3 alternatives under the same scoring (only Recipes marked with that Course; excluding the current Recipe, Recipes planned in another Course of the same slot and date, and any Recipe reserved for a later Slot Rule cell, §7.2), each with its why chips. On the main Course a Whole meal alternative carries a "Whole meal: no Side" chip naming what it covers. Choosing one pins it and replans the downstream unpinned cells, because Leftovers and Overlap may change. Choosing a Whole meal for the main Course removes the unpinned, uncooked Planned Meals in the slot's other Courses; Pinned and Cooked ones stay. Swapping a Whole meal in the main Course for an ordinary Recipe uncovers the other Courses, and the replan fills them.

### 7.5 Courses on Today, the Plan and the board
- **One Course looks as before.** A Meal Slot that serves one Course shows its Planned Meal exactly as it did, with no Course name.
- **Several Courses** show as one slot block: the slot name and time once, then one row per Course in the slot's order, each with the Course name as a small caption, the Recipe photo, name, state (Planned, Pinned, Cooked, Not cooked), why chips and its own actions (Swap, Pin, Cook, Mark as Cooked). The main Course row is the larger one. On Today the Tonight tile is the slot block; its main Course takes the hero picture and the other Courses are compact rows under it.
- **A covered slot** shows the main Course row with a "Whole meal" chip, and the covered Courses do not appear: no empty rows and no Couldn't plan chips.
- **A Course the slot no longer serves** still shows on a date where its Planned Meal was Cooked or Not cooked, as history.
- **The Planned Meal sheet** (Plan and Today) is per Course; its header names the slot and the Course ("Tue Dinner · Side"). The slot block has a slot menu with **Not cooked: whole slot** (every unresolved Course of that slot, "we had takeaway") next to each Course's own Not cooked.
- **Kitchen board:** the tonight tile lists the slot's Courses as rows in slot order (main Course first in size); tomorrow's tile writes each slot as "Dinner: Roast chicken + green beans"; a covered slot shows its Whole meal alone. The big Cook Mode button opens the main Course, or the first Course still to cook.
- **Slot Rules editor** (Plan > Rules): a rule picks a Meal Slot and then a Course of that slot (the shared Course select, limited to that slot's Courses, default the main Course); a Recipe rule offers only Recipes marked with that Course. A rule list row reads "Friday Dinner · Main = pizza".

## 8. Cooked and Leftovers

Everything in this section works on one Planned Meal, which is one Course of a slot (§7.2): each Course is marked Cooked or Not cooked on its own, deducts its own Stock, records its own Leftover (whose source is the date, Meal Slot and Course of the Cooked Planned Meal) and has its own Reheat.

- **Mark as Cooked** (from Cook Mode, Today or the Plan) shows the proposed Leftover portions (Batches × Yield − Attendance need), which the User can edit with a ± control. Confirming:
  1. deducts Stock (§6);
  2. records the actual Leftover with its Use-by = cooked date + the Use-by days;
  3. replans: if the actual Leftover is smaller than what was already placed, the affected Leftover meals are unpinned and replanned; if it is larger, the extra becomes a pending Leftover.
- **Not cooked** ("we had takeaway") marks the Planned Meal as skipped: no Stock change and no Leftovers, and the Planned Meals served from its Leftover are replanned. **Not cooked: whole slot** does the same for every unresolved Course of that slot on that date, in one step. Not cooked on a Whole meal in the main Course does not uncover the other Courses: the slot was not eaten from the plan.
- A Planned Meal served from a Leftover that is due today offers **Reheat** on Today. Reheat opens a screen with a reheating timer scoped to that Planned Meal. The timer starts at the Recipe's Reheat time when it has one; otherwise at 2 minutes for one portion plus 1 minute for each further portion, at most 10 minutes. Either start is adjustable by 30 seconds, from 30 seconds to 30 minutes. Mark as Cooked then takes the portions off the Leftover and leaves Stock unchanged (Stock was deducted when the Batch was Cooked); like any Cooked or Not cooked, it cancels the Planned Meal's timers, the Reheat timer included. Leaving the screen early keeps the timer running and consumes nothing.
- A Planned Meal that is still unconfirmed 2 h after its slot time appears in Today's "To confirm" tile and triggers a reminder. The tile groups a slot's Courses under one heading ("Tue Dinner: Roast chicken, green beans"), each confirmed on its own, plus **Mark all Cooked**, which opens one sheet with each fresh Course's proposed Leftover (± each) and confirms them together.
- Leftovers past their Use-by are discarded automatically and count as waste.

## 9. Shopping List

- **Range:** uncooked, non-skipped Planned Meals from now up to a date the User chooses (default today + 7 days, capped at the horizon). Every Course counts: each Course is its own Planned Meal, so the Shopping List sums them all with no Course-specific rule. A covered Course has no Planned Meal and needs nothing.
- **Need** per Ingredient = the sum, over those meals, of Batches × quantity (converted to Base Unit, optional lines excluded). Leftover meals need nothing.
- **Available** = projected Stock lots still within their go-off date on the date each meal needs them.
- **Line** = need − available, if positive. Display: the quantity in Base Unit, plus a pack suggestion from the Product last bought for the Ingredient (at the selected Shop if known), e.g. "1400 g · 2 × Mutti 700 g". Packs are rounded up, and the expected remainder feeds Ingredient Overlap. If no Product has been bought yet, the line shows the exact amount with no pack remainder.
- **Manual extras:** a free-text line (e.g. "toilet paper"), or an Ingredient with a quantity. Neither is tied to the plan, and a manual extra stays until it's ticked or deleted.
- **Estimated cost:** the sum of suggested packs × the latest Price at the selected Shop (or any Shop if there's none at the selected one). Lines without a price show "—".
- The list recomputes live as the plan or Stock changes. Ticked state is kept per Ingredient for the current list range.
- **Tick by hand** (for weighed produce without a barcode, or items scanned elsewhere): it asks "how much?", prefilled with the line quantity, and adds a Stock Lot.

## 10. Scanning

### 10.1 Shop mode
Started from the centre **Scan** button. It picks the Shop (the last one used, or one chosen from a list that leads with the Shop the User is in and lets any User add one, §5), then shows the compact viewfinder strip above the live Shopping List. Scanning is continuous; each successful read gives a short beep and a haptic buzz, with a per-device mute toggle. iOS Safari has no vibration API, so the beep is the confirmation there.

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
- whether it's a global or a Shop-only barcode;
- an optional **Picture** of the pack (the shared image picker, 4:3). While the phone is offline the field stays: the picture is shrunk on the phone (long edge 1600 px, at most 2 MiB; no link, because the server fetches links), kept with the queued scan and uploaded when the phone syncs (§10.3).

Saving creates the Product (and Shop Barcode) and then proceeds as for a resolved barcode. A scan line shows the Product's Picture as a small thumbnail before its text: the scan result carries it (`productImageUrl`, absent when none) and the phone's offline data carries it per Product (`imageUrl`) so a queued scan shows it too. If the barcode was meanwhile created by someone else, the scan is merged into the existing Product (§10.3): the form's Picture fills it only when that Product has no Picture, and never replaces one; the notice then says the picture was added. A barcode matching a Shop's Weight Barcode Rule prefix whose item code is unknown asks only for the Ingredient and Product name.

When the list is empty, the **Shopping list complete** celebration appears with the number of items, the total spent and the number of Stock Lots added.

### 10.2 Stock-take mode
This is the same scanner without a Shop. Each scan opens a sheet with the Product and current Stock, plus **+1 pack**, **−1 pack** and **Set total**.

### 10.3 Offline and sync
- The PWA caches the app shell, the current Shopping List, Products with their barcodes, Shop Barcodes and Weight Barcode Rules.
- Scans made offline are queued with a client UUID and a timestamp, and applied in order when back online. The server is idempotent on the UUID.
- Unknown-barcode forms filled in offline are created on sync. If two people created the same barcode, the second is merged into the first, with a notice.
- A Picture picked on an unknown-barcode form while offline is queued with the scan (as a Blob in the phone's database, not in the scan itself). On sync, for each queued scan with a Picture, in order, the phone uploads the Picture first and then sends the batch with the returned image ids. An upload that cannot reach the server is retried with the same growing waits as a failed sync (1 s, 2 s, 4 s ... 30 s), and nothing is sent until it works. A Picture that can never be uploaded (too large, not a supported image, refused, or gone from the phone) is given up: the scan syncs without it and a notice says "The picture of <Product> ... so it was added without one". A scan whose uploaded Picture no longer exists on the server (cleaned up before the scan synced) is applied without the Picture too, never rejected. A phone with no room for the Picture queues the scan without it and says so.
- Live updates use Server-Sent Events (Shopping List, plan, Stock, timers), so two shoppers see each other's ticks within about 1 s.

### 10.4 Camera
The camera uses the `BarcodeDetector` API where available, otherwise a WASM fallback (e.g. ZXing). It needs HTTPS. A torch toggle is shown when the camera supports one. Formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR and DataMatrix. QR/DataMatrix payloads that are GS1 Digital Link URLs are parsed for their GTIN (AI 01) and treated like an EAN/UPC. Other QR content is ignored with a "not a product code" toast.

## 11. Cook Mode and the kitchen board

- **Cook Mode** opens for a Planned Meal, so for one Course (or a Recipe with a chosen Batch count). Cook Mode shows **one Course at a time**. When the slot has other fresh Courses on that date, a Course switcher under the header lists them ("Main · Side · Dessert", the current one selected); switching keeps every timer running, because timers are synced and shown across scopes, and each Course keeps the Step it was on. Steps of different Courses are not merged into one timeline. The last Step offers **Mark as Cooked** for that Course only. A Course served from a Leftover is not in the switcher; it uses Reheat. Steps are shown one at a time, with the `uses` amounts scaled to the Batches. Completed Advance Steps are listed above as done; ones not done show a warning. A Planned Meal served from a Leftover has no Steps and does not open Cook Mode; it uses Reheat (section 8).
- Passive Steps start a **timer** when the Step is reached. Timers keep running across Steps and are shown as tiles, with an alarm sound plus a push notification when one ends. Timers are synced, so the phone and the tablet show the same timers.
- **Navigation:** Back/Next tiles; on a tablet, tapping the left or right half of the step tile also works. A Step starts only once every Step in its `after` has finished ([recipe-file.md](recipe-file.md)): while a timer of such a Step is still counting down (running or paused), **Next is held** (the tile, the tablet tap zone and the "next" voice command) and a line says what it waits for and how long is left, e.g. "Next waits for Step 1 · Pre-heat the oven: 4:12 left. Cancel its timer to go on now." A finished, dismissed or cancelled timer, or one that never started, holds nothing. The Cook view sends each Step's `after` (Recipe Step indexes). Optional voice commands ("next", "back", "repeat", "start timer", "pause timer") use the browser's speech recognition where available, and are off by default.
- The screen stays awake (Wake Lock). The last Step offers **Mark as Cooked** (§8).
- **Kitchen board** (tablet, the `/board` route; Courses as in §7.5): a Bento grid with the clock, tonight's Planned Meals, the next Advance Step, Leftovers, use-soon lots, running timers, tomorrow's meals and the zero-waste streak. It refreshes live, switches to dark at local sunset and back at sunrise (computed from the household Location in §3, falling back to 19:00–07:00 if none is set), and has a big button to start Cook Mode.

## 12. Notifications (Web Push)

Each User opts in per device, and per notification type:

| Type | When |
|---|---|
| Advance Step due | slot time − lead time, per Step of each Course's Recipe (e.g. "Marinate the chicken now for 19:30") |
| Start cooking | slot time − total time, **per Course**: each Course has its own start ("Start cooking green beans now to eat at 19:30") |
| Confirm Cooked | 2 h after slot time if any Course of the slot is still unconfirmed; **one per slot**, naming the Recipes ("Did you cook roast chicken and green beans?") and opening that slot |
| Leftover Use-by | 10:00 on the Use-by date |
| Stock about to spoil | 10:00 on the go-off date (the day before the lot goes off), if no plan uses it: "Spinach is good until today and no Planned Meal uses it" |
| Timer finished | immediately, ignoring quiet hours |
| Access Request | when someone asks to sign in (deferred out of quiet hours) |

Notifications are suppressed during quiet hours (except timers) and deferred to the end of the quiet window.

A reminder already sent is not sent again: the sent-reminder keys gain the Course for Start cooking and Advance Step (`<date>/<mealSlotId>/<courseId>`), Confirm Cooked stays keyed by slot, and the upgrade rewrites the keys already stored so nothing sent before it repeats. A covered Course has no Planned Meal, so no reminder.

## 13. Import and export

- **Export:** pick one or more Recipes, or all of them, and download a `.feeder.json` file with images embedded ([recipe-file.md](recipe-file.md)).
- **Import:** upload or paste JSON, then go through Import Review (recipe-file.md, *Import Review*).
- A Recipe's Reheat time travels in the Recipe File as the optional `reheatMinutes`; files without it stay valid (the format is still version 1).
- **Courses and Whole meal in a Recipe File** (decision 29; schema and recipe-file.md change with the code, team E of [crs-plan.md](../dev/design/crs-plan.md)). A Recipe gains two optional fields; files without them stay valid (still version 1):
  - `courses`: an array of Course **names** (strings, 1 to 40 characters, unique), written by the Recipe File in household order. Import matches each name to the Household's Courses as Tags are matched (case, accents and spacing ignored), archived Courses included (Import Review then offers to unarchive). **An unknown name** is shown on the Recipe's row in Import Review ("Soup is not one of your Courses") with the shared Course select: use an existing Course (default: the main Course), skip it, or, for an Admin only, **Add Soup as a Course**. Import does not create a Course without that choice. A Recipe left with no Course gets the main Course. A file without `courses` gives each Recipe the main Course.
  - `wholeMeal`: a boolean. Absent means `true` for a Ready Meal whose Courses (after matching) include the main Course, and `false` otherwise, the same default as the Recipe editor and the upgrade.
  - The Agent Prompt gains two rules: list the household's Course names (the copied prompt fills them in; `{{COURSES}}`) and ask the AI to pick one or more of them for each Recipe; and set `wholeMeal` true only for a Recipe that is a complete serving on its own (a one-pot Recipe, a Ready Meal with its sides), not for a bought dessert or side.
  - **Recipe Assistant.** Its output schema is the projection of the Recipe File schema, in which every property is required ([ADR 0006](../adr/0006-recipe-assistant-calls-anthropic-from-the-server.md), `internal/recipeassistant/outputschema.go`). So the projection gains `courses` (array of strings) and `wholeMeal` (boolean) as required on each Recipe, with no enum (the schema stays the same for every Household; the household's names reach the model through the prompt). The model's "none" for them is `[]` and `false`: `[]` is pruned as before, so the import default applies; `false` is kept, an explicit "not a Whole meal". The addendum's "none" sentence stays as it is (it already covers lists and yes/no fields).
- A Product's Picture is not part of a Recipe File (it holds Recipes and their Ingredients, not Products).
- An Ingredient's picture travels in the Recipe File as the optional `image` of its definition (a data URL on export, a data URL or https URL on import, handled like a Recipe photo); files without it stay valid (still version 1). Import gives the picture to an Ingredient it **creates**, and to an Ingredient the Household already has that has **no picture**; an existing picture is never replaced. Import Review says so on the row ("Adds a picture to Garlic"). Nothing else about an existing Ingredient changes except the missing Unit Conversions it adds. A picture that cannot be fetched is dropped with an `image_failed` warning at `$.ingredients[i].image`. Member photos are not part of a Recipe File.
- **One image path.** Every image field (Recipe photo, Step photo, Ingredient picture, Product picture, Member photo) uses the same image picker and the same server endpoints (`/api/images`); a scripted guard (`image-input` in `scripts/check-ui.sh`) fails the build when a screen builds its own image input. The nightly clean-up keeps every image that a Recipe, Step, Ingredient, Product or Member uses (§15, decision 25).
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
27. (2026-11-10) Pictures for Products (PP): a Product may have one Picture (4:3), added in the Product sheet, on the Product page and in the "what is this?" sheet; it is shown as a thumbnail on Product rows and on the scan line, is kept by the nightly clean-up, and is not part of a Recipe File (§5, §10.1, §13).
28. (2026-11-11) Product pictures on scans (PPX): a merged unknown-barcode scan gives its Picture to the existing Product only when that Product has none; the Picture field of the "what is this?" sheet is also offered offline, where the picture is shrunk, queued with the scan and uploaded on sync before the scan is sent; a Picture that cannot be uploaded or is gone is dropped and the scan still applies (§5, §10.1, §10.3).
29. (2026-11-11) Courses ([ADR 0008](../adr/0008-courses.md)). The Household defines ordered Courses in Settings (seeded Main, Side, Starter, Dessert; Main carries the main flag). A Recipe is marked with one or more Courses and may be a **Whole meal**; a Meal Slot serves an ordered list of Courses (at least one; the multi-day editor applies it too). A Planned Meal is keyed by date, Meal Slot and Course, and each Course is planned, swapped, Pinned, Cooked or Not cooked with its own Leftover and Reheat. A Course is filled only by a Recipe marked with it (Course fit, Leftovers included). A Whole meal in the slot's main Course covers the slot's other Courses on that date (not planned, not Couldn't plan); Pinned and Cooked Planned Meals in them stay, and while one exists the planner does not pick a Whole meal there. A Ready Meal is a Whole meal by default (when its Courses include the main Course), not by rule. Variety Rules, Cool-down and recency count across Courses; Slot Rules target one Course (the main Course by default); Attendance stays per slot. A slot whose Course no Recipe is marked with is Couldn't plan under the new cause "No Recipes for this Course". The main Course cannot be removed while flagged; a Course that was ever planned is archived instead of removed for good, with a replacement Course for what would be left without one. Cook Mode shows one Course at a time with a Course switcher; Start cooking is per Course and Confirm Cooked per slot; the Shopping List sums every Course. The Recipe File gains the optional `courses` (names) and `wholeMeal`; unknown names are resolved in Import Review (default: the main Course). Upgrade: migration 1400 gives every Recipe, Meal Slot, Slot Rule and Planned Meal the main Course and marks Ready Meals Whole meal (§3.1, §4, §7, §8, §9, §11, §12, §13, §16).

## 16. API changes for Courses

All JSON is camelCase. Reads are open to every User, writes on Courses and Meal Slots to the Admin (as for Meal Slots today), and plan writes to every User. Every write is CSRF-guarded as today, and each publishes a household event (`changed: courses`, `mealSlots`, `recipes` or `plan`) after commit.

**Courses** (new, `internal/course`):

| Route | Body / query | Answer | Errors |
|---|---|---|---|
| `GET /api/courses` | `?archived=1` adds archived ones | `{ "courses": [{ "id", "name", "position", "main", "archived", "recipeCount", "mealSlotCount", "planned" }] }`, household order | |
| `POST /api/courses` | `{ "name" }` | `201` the Course, added last | `422 validation_failed` (`field: name`), `409 course_name_taken`, `422 too_many_courses` (20) |
| `PATCH /api/courses/{id}` | `{ "name"?, "main"?: true }` | `200` the Course; `main: true` moves the flag from the old main Course in the same transaction | as POST; `main: false` and a `main` on an archived Course are `422 validation_failed` |
| `PUT /api/courses/order` | `{ "ids": [...] }`, every listed Course once | `200` the list | `422 validation_failed` |
| `GET /api/courses/{id}/impact` | | what a Delete or Archive changes: `{ "planned", "recipes", "recipesOnlyThis", "mealSlots", "mealSlotsOnlyThis", "plannedMeals": [{ "date", "mealSlotId", "mealSlotName", "recipeName", "pinned" }], "slotRules": [ruleOut] }` | `404` |
| `DELETE /api/courses/{id}?replacement=<id>` | | `204` | `409 course_main`, `409 course_last`, `409 course_planned` (offer Archive), `422 validation_failed` (`field: replacement`: missing when needed, archived, or the Course itself) |
| `POST /api/courses/{id}/archive` | `{ "replacementId" }` | `200` the Course | as DELETE, except `course_planned` |
| `POST /api/courses/{id}/unarchive` | | `200` the Course, last in the order | `422 too_many_courses` |

**Meal Slots.** A slot body gains `"courses": [{ "id", "name", "main" }]` in the slot's order. `POST /api/meal-slots` and `PATCH /api/meal-slots/{id}` take `"courseIds": [...]` in order (absent on POST: the main Course; absent on PATCH: unchanged). `PATCH /api/meal-slots/batch` takes `set.courseIds`, and a new `"dryRun": true` that answers the same shape plus `"removes": { "plannedMeals": [...], "slotRules": [...] }` without writing, for the editor's preview; a real save answers `removes` too. Errors: `422 validation_failed` with `reason: courses_empty` or `course_unknown` (`field: courseIds`), duplicates dropped.

**Recipes.** A Recipe gains `"courses": [{ "id", "name" }]` (household order) and `"wholeMeal": bool`. `POST` and `PUT /api/recipes/{id}` take `"courseIds"` and `"wholeMeal"` (defaults in §4). `GET /api/recipes` takes `?course=<id>` (marked with it) and `?notCourse=<id>` (not marked with it, for the Couldn't plan fix).

**Plan.** Every Planned Meal route gains the Course; the course-less routes are removed (the SPA ships in the same binary):

| Route | Change |
|---|---|
| `GET /api/plan` | Each slot (`slotOut`) loses `meal` and `unfilled` and gains `"courses": [{ "courseId", "name", "main", "meal": mealOut \| null, "unfilled": unfilledOut \| null, "coveredBy": null \| { "courseId", "recipeId", "recipeName" } }]` in the slot's order, plus history rows for Courses the slot no longer serves (§7.5). `mealOut` gains `courseId`, `courseName` and `wholeMeal`. |
| `PUT /api/plan/{date}/{slotId}/{courseId}` | Set (and pin) the Recipe of that Course. `422 recipe_not_in_course` when the Recipe is not marked with it, `422 course_not_in_slot`, `409 recipe_in_slot` when the Recipe is already in another Course of that slot and date. A Whole meal in the main Course answers `"covered": [courseId...]` and removes the unpinned, uncooked Planned Meals there. |
| `POST /api/plan/{date}/{slotId}/{courseId}/confirm`, `/unpin`, `/cooked`, `/not-cooked`; `GET .../{courseId}/alternatives`, `/cook` | As before, for that Course. `alternativeOut` gains `wholeMeal` and `covers` (Course names). |
| `POST /api/plan/{date}/{slotId}/not-cooked` | **Not cooked: whole slot**: every unresolved Course of that slot and date. |
| `POST /api/plan/{date}/{slotId}/cooked` | **Mark all Cooked**: `{ "courses": [{ "courseId", "leftoverPortions" }] }`, all or nothing. |
| `GET /api/plan/couldnt-plan`, `/to-confirm`, `/leftovers` | Entries gain `courseId` and `courseName`; a reason may be `no_course_recipes`; a Leftover gains `fromCourseId`. The Cooked answer's `plannedFor` and `servedFromLeftover` gain `courseId`. |
| `GET/POST /api/slot-rules` | A rule gains `courseId` (POST: default the main Course). `422 course_not_in_slot`, `422 recipe_not_in_course`. |

**Cook Mode.** `GET /api/cook/meals/{date}/{slotId}/{courseId}` replaces the two-part route; it answers the Course and `"otherCourses": [{ "courseId", "name", "recipeName", "fresh", "state" }]` for the switcher. Timer and Advance Step scopes are `meal:<date>/<mealSlotId>/<courseId>`; the two-part form is `400 invalid_scope`.

**Today and the board.** `GET /api/board` and Today's tiles carry the same `courses` list per slot; `GET /api/today/advance-steps` entries gain `courseId`.

**Recipe File.** `GET /api/recipe-file/export` writes `courses` and `wholeMeal`. The Import Review session lists `"unknownCourses": [{ "name", "recipes": [...] }]`, and `POST /api/imports/{id}/plan` takes `"courseChoices": [{ "name", "use": <courseId> | "skip" | "add" }]` (`"add"` is Admin-only: `403` otherwise). `GET /api/recipe-file/agent-prompt` fills `{{COURSES}}` with the household's Course names.
