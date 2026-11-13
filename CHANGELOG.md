# Changelog

All notable changes to the Feeder are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Prereleases are tagged `-beta.N`, then `-rc.N`, before the stable `1.0.0`.

## [Unreleased]

## [1.0.0-beta.6] - 2026-11-13

Base recipes: a béchamel, a pasta frolla or a stock that other Recipes call for by amount, covered from Stock first and ready by the Step that needs it.

### Added

- **Base recipes.** Mark a Recipe as a Base recipe in the Recipe editor and give it a Yield, an amount in g, ml or portions and so on (1 l, 300 g, 8 portions). A Base recipe has no Courses and is not planned on its own, so it is not chosen for a Meal Slot, swapped, Pinned or named by a Slot Rule. The Recipes list hides Base recipes until you pick the Base recipes filter, and a Base recipe's page shows its Yield, the Recipes it is used in and its Stock.
- **Use one as a line.** Pick a Base recipe in the Ingredient picker, where it carries a Base recipe badge, and add it to another Recipe by amount ("500 ml Béchamel"). The Ingredients inside follow the Yield. A Base recipe can call for other Base recipes at any depth, and Feeder refuses a loop ("Béchamel calls for Roux, which calls for Béchamel"). A line can say which Step it is Needed at.
- **Link existing lines.** A plain line gets Link to a Base recipe, with search, an offer to add a new Base recipe from the line's name, and Undo or Use as a plain Ingredient to put it back. When a Recipe becomes a Base recipe, Feeder lists the other Recipes with an Ingredient of the same name, nothing ticked, and links only the lines you tick. Nothing is linked without your say.
- **Take over a plain Ingredient.** When a Base recipe has the name of an Ingredient you already have, Feeder asks whether the Base recipe takes it over, naming the Recipes it is on and its Stock. Yes turns all its lines into Base recipe lines and keeps the Stock; No keeps it apart. Once no line uses the old Ingredient, Feeder offers to merge it into the Base recipe's.
- **The planner, Exclusions and Advance Steps follow Base recipes.** Every Ingredient inside a Base recipe counts for Exclusions and Review Exclusions as if it were on the Recipe, and a Base recipe's Advance Step counts for the lead time. A Base recipe takes an Exclusion only, no Favourite or Dislike.
- **The Shopping List uses Stock of a Base recipe first.** A jar or a frozen batch in the Pantry is drawn first, and only the Ingredients of the part Stock does not cover are listed.
- **Cooked uses Stock first.** Mark as Cooked takes the jar or batch first and deducts the Ingredients of only the part that is made. Used from lets you pick which jar, and Courses of one slot that call for the same Base recipe share a jar.
- **Base recipes in Cook Mode.** Steps carry their Base recipe's name, the Step it is Needed at reads "Béchamel ready", and a Base recipe that Stock covers shows "Already in Stock" and "Béchamel from Stock" instead of its Steps. Its Steps are placed before the Step they are Needed at, where the Recipe's total time is shortest, and Start cooking comes earlier to fit them.
- **Recipe File and Import Review.** Recipe Files can mark a Base recipe, say what its Yield is counted in, and mark a line that calls for another recipe. Import Review spots those lines, and any line whose name matches a Base recipe, a Recipe you plan or a Recipe in the same file, and asks what each is: use a Base recipe, use one from the same import, add a new one, turn a planned Recipe into one, or keep a plain Ingredient. It can also offer Read it next to read the missing recipe after Confirm, and offer to link the matching lines once the import is saved. Confirm waits for every answer.
- **Recipe Files carry their Base recipes.** A Recipe File that Feeder writes for a Recipe also holds every Base recipe it calls for, at any depth, once each.

### Changed

- **Total time and Start cooking** of a Recipe include the Steps of the Base recipes it calls for, and its longest Advance Step lead includes theirs. Editing a Base recipe updates them at once for every Recipe that calls for it, at any depth, so Recipe tiles and the planner agree with the Recipe's page.
- **The Ingredients page** shows a Base recipe's Ingredient with its badge and a link to the Base recipe, and keeps its name and its batch and portion Unit Conversions read-only.

### Upgrading

No new settings. The database is migrated on start: 1540 adds the columns behind Base recipes. It only adds columns, so every Recipe stays a plain Recipe you can plan and no line changes until you link it. Migrations cannot be undone.

If the database already has applied migrations, Feeder first saves a checked copy of it as `feeder-pre-1540.db` in the `backups` folder of the data volume (`/data/backups`), before migration 1540 is applied. It is not listed in Settings, the nightly clean-up does not remove it, an existing copy is kept, and a fresh install takes none. If the copy cannot be written, Feeder stops with a log line naming the file and migrates nothing.

Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.6 --namespace feeder --reset-then-reuse-values`, or pull the new image and restart.

To go back to 1.0.0-beta.5.1, stop Feeder (on Kubernetes, set the deployment to zero replicas), copy `feeder-pre-1540.db` over `feeder.db` (and delete `feeder.db-wal` and `feeder.db-shm`), then start the older image. Everything you changed after the upgrade is lost. On Kubernetes, `helm history feeder -n feeder` lists the revisions and `helm rollback feeder <revision> -n feeder` returns to the one that ran 1.0.0-beta.5.1, but only after the database is restored.

If you skip releases, each snapshot goes back to one image: `feeder-pre-1540.db` to 1.0.0-beta.5.1, `feeder-pre-1500.db` to 1.0.0-beta.4.2 and `feeder-pre-1400.db` to 1.0.0-beta.3. An upgrade from 1.0.0-beta.4.2 straight to this release holds both `feeder-pre-1500.db` and `feeder-pre-1540.db`, and both are the beta.4.2 database. The steps are in the deploy guide, "Upgrading from 1.0.0-beta.5.x to 1.0.0-beta.6".

## [1.0.0-beta.5.1] - 2026-11-13

A redesign of Today, Plan and Shop on one set of design rules, so screens line up, read clearly and use colour with meaning on phones, tablets and desktops alike.

### Changed

- **Shop.** The Shopping List is one row per Line: tick, Picture, name with one short line under it, and the quantity in a column. On a tablet the rows sit in two columns. Tap a row for its sheet (Mark it, Not needed, Delete); the ⋮ buttons are gone. "Shop for" and "Shop" are compact pickers in one row. A summary at the top shows how much is left, with a progress bar, and how many Lines have no Price yet. Lines from past Planned Meals not marked Cooked are named once, in a notice above the list.
- **Today.** To confirm has one row per Meal Slot with Cooked (or All Cooked) and Adjust; Not cooked is in the menu. The top tile keeps the Main Recipe after its time and asks "Dinner cooked?". A summary strip shows the Zero-waste streak, Leftovers to use and Lines to get, sharing one row. "Throw out or keep?" shows three Stock Lots, then Show more.
- **Plan.** Days are equal tiles, two per row on a tablet, with today marked by a ring. Each Meal Slot has a header with its full name and its Cook and ⋮ buttons; each Course is one row with the Recipe name in full, one line of chips and Swap and Pin. A row shows at most two chips, then "+N" naming the rest.
- **Design rules.** One set of type sizes, colour only where it means something (green for Cooked, teal for Leftovers, blue to confirm, orange and red for going off), Pictures without a photo show their first letter, chips stay on one line, and pages end above the bottom bar. Status tiles have a thin border in their colour so they stand out with every accent.

### Fixed

- **Names broken mid-word** on tablets, such as "Cauliflo-wer", and Plan rows that pushed the page sideways on a phone.
- **Buttons and chips cut short** or overlapping text on narrow screens.

### Upgrading

No new settings and no migrations. Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.5.1 --namespace feeder --reset-then-reuse-values`, or pull the new image and restart.

## [1.0.0-beta.5] - 2026-11-12

A Meal Slot on one date (Not served, Guests, its own time), Leftovers answered by hand and kept in the freezer, Bought Planned Meals that stay, Used from at Mark as Cooked, Stock Lots on the Pantry, and a cleaner Settings.

### Added

- **Leftovers by hand.** A Leftover past its Use-by is no longer thrown away on its own. A Leftover takes Had it (portions used outside the plan, not waste), Threw it out (waste dated the day of the action, or the day after the Use-by when the Leftover is already past it), Freeze it (into a Freezer, for the Frozen Use-by) or Take out (out of the Freezer, for the Recipe's Use-by days). Each one shows the Planned Meals it would replan.
- **Frozen Use-by.** Each Recipe can set its own Frozen Use-by, from 1 to 365 days; the Household sets the default in its settings (90 days). A Leftover in a Freezer is not planned automatically: pick it with From the freezer in Choose a Recipe, and Cooked takes only the portions used, leaving the rest frozen.
- **Answer a Leftover past its Use-by.** Had it, Threw it out, or Wasn't there. Had it and Wasn't there are not waste; Threw it out is waste dated the day after the Use-by. Until it is answered a Leftover past its Use-by waits on Today and is not planned again, so the Zero-waste streak holds.
- **Frozen Leftovers on the Pantry.** A frozen Leftover shows inside its Freezer on the Pantry, after the Stock Lots, with its portions and Use-by. A Leftovers filter shows only them, and Had it, Threw it out and Take out are on each row. Take out lists the Planned Meals it would replan. A Leftover whose Freezer is gone shows under Not sorted, and deleting a Storage Place says which frozen Leftovers it holds.
- **From a Leftover.** A Planned Meal served from a Leftover has a link such as "From Mon's Chilli" that opens the Leftover with its portions, Use-by, Storage Place and actions. Choose a Recipe has From the freezer to plan a frozen Leftover.
- **Stock Lots inline.** On the Pantry, each Ingredient shows its Stock Lots under its name, with the quantity, Bought on and Good until of each, so the Stock is visible without opening every Lot.
- **Edit a Stock Lot.** Correct a Stock Lot's quantity, Bought on and Good until from its sheet. Changing Bought on suggests Good until again from the Shelf Life, unless Good until is chosen in the same edit. An Ingredient with a Shelf Life needs a Good until; "No go-off date" is offered only without one. A Storage Place is still changed with Move to.
- **Delete a Stock Lot.** Delete removes a Stock Lot entered by mistake, such as a double Scan. It is not counted as waste.
- **Not served for one date.** The slot menu on Plan and Today has Not served for that date only. Feeder asks first when Planned Meals go (naming what goes, and what was bought), then the slot reads "Dinner · Not served" with Plan Dinner again, and the toast has Undo. The kitchen board's Tonight and Tomorrow tiles show it too.
- **Who's eating with Guests.** The Who's eating sheet on Plan and Today takes Guests, 0 to 20, who eat one standard portion of every Course. Taking every Member off a date with no Guests leaves it Not served, as Settings does.
- **Time today.** The slot menu on Plan and Today sets the time of one date (Time today, or Time on Thu), with Back to the usual time. A date with its own time reads "20:15 · usually 19:30".
- **Dates that differ on Settings > Meal Slots.** The page lists the coming dates whose slot has its own time, is Not served, or has Guests.
- **Mark it on the Shopping List.** The hint "Includes Tue Dinner, not marked Cooked yet" has a Mark it button that opens that slot's Mark as Cooked sheet on the Plan.
- **Bought Planned Meals are kept.** Once a Scan or Tick by hand on the Shopping List covers part of a Planned Meal's Ingredients, the Planned Meal is Bought, and automatic replans leave it as it is. Plan and Today show a Bought chip and what was bought, and warn when a Bought Planned Meal now breaks a rule: an Exclusion, an archived Recipe or a lost Course. Regenerate asks first, naming the Bought Planned Meals it would replace, and Swap notes what stays in Stock.
- **Used from at Mark as Cooked.** The Mark as Cooked sheet and the Mark all Cooked sheet, on Plan, Today and in Cook Mode, have a Used from row: pick the Stock Lots a Cooked Planned Meal took an Ingredient from, with the amount from each, or leave it on soonest to go off first. Mark all Cooked refuses a pick that takes more from a Stock Lot than it holds.
- **Not needed on the Shopping List.** A line's menu has Not needed: the line leaves the list for its range, adds no Stock and is not a purchase. A group "Not needed (2)" at the end lists them with Needed after all.

### Changed

- **Seven buttons in the bottom bar.** Settings is now its own button, every button has the same width, Scan sits in the centre, and the highlighted button has room at both ends of the bar.
- **Settings > Meal Slots.** One card per Meal Slot with its usual time, Courses, who eats and the days it is served, plus the days that differ. Dates that differ lists the coming dates with their own time, Not served or Guests.
- **Settings in three groups.** Settings is grouped into Catalogue, Household and You.
- **Recipes by last cooked.** The Recipes list has a Sort select: Name, Last cooked longest ago first, or Last cooked most recent first, and each Recipe shows when it was last cooked.

### Upgrading

No new settings. The database is migrated on start: 1500 adds the Meal Slot on one date (Not served, the date's own time and Guests), 1510 lets a Leftover sit in a Storage Place and be frozen and adds the Frozen Use-by and the history of Leftovers by hand, 1520 records which Planned Meal a purchase from the Shopping List was bought for, and 1530 adds Not needed on the Shopping List. Migrations cannot be undone. Purchases made before the upgrade have no record, so a Planned Meal becomes Bought only by a purchase after it.

If the database already has applied migrations, Feeder first saves a checked copy of it as `feeder-pre-1500.db` in the `backups` folder of the data volume (`/data/backups`), before any of the four migrations runs. It is not listed in Settings, the nightly clean-up does not remove it, an existing copy is kept, and a fresh install takes none. If the copy cannot be written, Feeder stops with a log line naming the file and migrates nothing.

A Leftover past its Use-by is no longer thrown away at 03:00: after the upgrade it waits on Today until someone answers Had it, Threw it out or Wasn't there.

Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.5 --namespace feeder --reset-then-reuse-values`, or pull the new image and restart.

To go back to 1.0.0-beta.4.2, stop Feeder (on Kubernetes, set the deployment to zero replicas), copy `feeder-pre-1500.db` over `feeder.db` (and delete `feeder.db-wal` and `feeder.db-shm`), then start the older image. Everything you changed after the upgrade is lost. On Kubernetes, `helm history feeder -n feeder` lists the revisions and `helm rollback feeder <revision> -n feeder` returns to the one that ran 1.0.0-beta.4.2, but only after the database is restored. The steps are in the deploy guide, "Upgrading from 1.0.0-beta.4.2 to 1.0.0-beta.5".

## [1.0.0-beta.4.2] - 2026-11-12

A fix for the photo editor in Read a recipe.

### Fixed

- **Crop handles.** The crop handles of the photo editor sit on the crop box again; on the Photo choice of Read a recipe they were scattered across the step.
- **Photos after a read.** After a recipe is read from photos and reaches review, the photos are cleared, so the next read starts fresh; a failed read keeps them.

### Upgrading

No new settings and no migrations. Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.4.2 --namespace feeder --reset-then-reuse-values`, or pull the new image and restart.

## [1.0.0-beta.4.1] - 2026-11-12

Reading a recipe from photos with the phone's own camera app and an editor, and a round of visual fixes found in the beta.4 QA.

### Changed

- **Reading a recipe from photos.** On the Photo choice of Read a recipe, a phone offers Take photo, which opens its own camera app, and Choose photos, which picks several from its photo library or files; Feeder no longer opens its own camera view there. A computer chooses files, or drops or pastes photos. Each photo opens upright in an editor after it is added: turn it a quarter turn at a time with Rotate left and Rotate right, and crop it to any shape by touch, mouse or keyboard. Up to 4 photos are listed in page order, and each can be moved, edited again or removed. The photos are kept on the device until the read is finished, so they come back if the phone unloads the page while the camera app is open; removing a photo clears it, and leaving the Import Recipes page or signing out clears them all. Read recipe sends them in that order, shrunk so the longest side is at most 2,576 px. Photos up to 30 MB are accepted, and a HEIC photo that the browser can't show is kept as it is, up to 8 MB, without the edit step, and sent as it is. The Photo of a Recipe or a Member and the Picture of an Ingredient or a Product are added as before.
- **Email not verified.** When Google has not verified a sign-in email, Feeder now says "Google has not verified this email" and offers a different Google sign-in, instead of pointing to the Allowlist. The old /not-invited address leads to the new page.

### Fixed

- **Toasts and the sticky bar.** On a phone, a toast now appears above the sticky Save and Start Cook Mode bar instead of covering it.
- **Choose a Recipe on Today.** The "Choose a Recipe" action on the Today hero now has enough contrast against the accent background to read.
- **Kitchen board clock.** The time and the date in the clock Tile of the Kitchen board fit their Tile at every width from 600 px up, instead of touching the edge or breaking in the middle of a word.
- **Notification settings layout.** Settings > Notifications no longer nests a page inside a page, and is laid out as the other Settings pages are.
- **Sticky action bar on phones.** The sticky Save and Start Cook Mode bar now sits flush on the bottom navigation on a phone, with no gap under it.
- **Sign-in background.** The sign-in and waiting pages now paint the app's own background themselves, in the light and the dark scheme.
- **Sign-in wording.** The sign-in page names the Allowlist: a Google email on it signs in at once, and any other sends a sign-in request for a User to approve.

### Upgrading

No new settings and no migrations. Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.4.1 --namespace feeder --reset-then-reuse-values`, or pull the new image and restart.

## [1.0.0-beta.4] - 2026-11-12

Courses: a Meal Slot can hold a main Course and its sides, each planned, cooked and shopped for on its own, and the Tags get a page and colours.

### Added

- **Courses.** The Household has an ordered list of Courses (Main, Side, Starter and Dessert to begin with) on a new Courses page in Settings: add, rename, reorder, choose the main Course, archive or delete a Course with a replacement where Recipes depend on it. A Recipe is marked with the Courses it can fill, and each Meal Slot says which Courses it plans. The Plan, Today, the board and Cook Mode show a Meal Slot as one block with a row per Course.
- **Meal Slot Courses.** In the Meal Slot editor, pick the Courses of a slot and put them in order, for one weekday or several at once. Taking a Course off a slot names the Planned Meals and Slot Rules that go with it before you save. A Slot Rule belongs to a Course.
- **Course on Slot Rules.** When you add a Slot Rule for a Meal Slot with more than one Course, a Course select picks the Course it fixes; without a choice the rule fixes the main Course. A Slot Rule shows its Course only for slots with several Courses, for example "Friday Dinner · Starter".
- **Optional Courses.** A Course of a Meal Slot can be optional: the planner fills it when it can and leaves it empty without reporting Couldn't plan.
- **Course Attendance.** Who eats which Course: Members opt out of a Course of a slot, usually or on one date, and the planner counts portions, Batches and the Shopping List for the Course accordingly.
- **Whole meal.** A Recipe can be a Whole meal that needs no other Course beside it (a traybake, or a Ready Meal). It fills every Course it covers, so the slot gets no further Planned Meal for them. A Ready Meal is a Whole meal by default.
- **Combined cooking timeline.** Cook Mode for a Meal Slot lays the Steps of every Course on one timeline so that all the Courses finish together and no two Active Steps overlap. Start cooking reminders use the timeline's length, and Advance Step reminders are sent for each Course.
- **Soft Cool-down and Variety.** When every Recipe that fits a Course is still inside its Cool-down or a Variety Rule, the planner now fills the Course with the one that is due soonest instead of giving up. Such a Planned Meal carries an "Again soon" chip, and Swap marks the same alternatives. A Variety chip names the Tag as the Household wrote it ("3rd Fish this week"), and follows the Tag when it is renamed.
- **Course in the Recipe File and Recipe Assistant.** The Recipe File has `courses` and `wholeMeal`; a Recipe File written by Feeder carries them. Import Review asks what to do with a Course name the Household does not have, and the Recipe Assistant is told the Household's Courses. Existing files keep working.
- **Review Exclusions page.** On the Couldn't plan tile, Review Exclusions opens a page that names the Exclusions that left a Course empty ("Sam excludes garlic: rules out 4 Recipes"), each with a link to where it is changed.
- **Preferences table.** The Recipe detail shows the Favourite, Dislike and Exclusion of every Member in one table, and an Ingredient line shows who excludes it. The Ingredient page has an Excluded by Tile.
- **Tags page.** Settings > Tags lists every Tag with how many Recipes and rules use it. Any User can add, rename, recolour, merge or delete a Tag; renaming and merging carry the Slot Rules and the Variety Rule along, and a delete says what it touches first. A Tag can exist with no Recipe.
- **Tag colours.** Each Tag has one of ten colours, in light and dark, shown as a dot or pill on Recipe tiles, the Recipe detail and in the rules. A new Tag takes the colour least used so far.
- **Rules need a Tag that exists.** A Slot Rule or Variety Rule that names a Tag no one has added is refused with `422 tag_unknown`; the Tag spelled another way picks the existing Tag.
- **Tag suggestions.** While you type a Tag on a Recipe, the Tags the Household already uses are listed under the field with how many Recipes carry each; pick one with the arrows and Enter, or a tap. Typing an existing Tag in another spelling ("Pasta" for "pasta") picks that Tag, so no duplicate is made. On a Recipe, each Tag opens the Recipes list filtered by that Tag.

### Changed

- **Pantry in the main navigation.** Pantry is now a tab of the bottom bar and the side rail, between Plan and Scan, so the bar has six buttons with Scan exactly in the centre. The avatar menu keeps the Kitchen board and Settings. `/stock` still opens the Pantry.
- **New Feeder logo and app icons.** A casserole pot with a heart on its lid replaces the old mark in the browser tab, the installed app, the home screen and the signed-out pages. A new logo can take up to a day to show in a browser that has the old one.
- **List screen spacing.** Every list screen (Ingredients, Recipes, Products, Members and the others) now has the same space between its heading, search field and list.
- **Couldn't plan on Cool-down and Variety.** These two no longer leave a Course empty (see Soft Cool-down and Variety above); Couldn't plan keeps Exclusions and the other reasons.
- **Course-less plan and cook routes.** The Plan and Cook Mode routes without a Course are gone: an old per-slot path (`/api/plan/{date}/{slotId}/cooked` and the others, `/api/cook/meals/{date}/{slotId}`) answers 404, a Meal Slot carries its Planned Meals on its Course rows only, and the cook scope of a Planned Meal is always per Course (`meal:<date>/<slot>/<course>`, the main Course too). API users move to the routes with a Course.

### Fixed

- **Notification settings.** The page no longer waits on loading for ever in a browser that cannot receive push messages or has no service worker registered, and it finds this device reliably.
- **Small wording and layout fixes.** The Household is capitalised wherever it is named. Page titles break between words, not in the middle of one ("Pantry", not "Pant / ry"). Buttons wrap a long text instead of spilling out of their Tile and grow to fit it. A Shopping List line keeps "700 g" together and shortens a long name to two lines. Dialog bodies shrink to the screen. The Ingredient merge sheet, the error and warning lists in Import Review and the Unit Conversions list in the Ingredient editor no longer show list bullets.
- **Add to Shopping List.** The sheet is clearer about adding a line of text or an Ingredient with a quantity, and its Ingredient and date pickers open above the sheet instead of behind it. Select lists and date fields now float above every dialog.
- **Replans after a rules change.** A replan that was waiting after a change to the Slot Rules or Variety Rule could be replaced by a lesser one and the change was not applied. It is now always carried out.

### Upgrading

No new settings. The database is migrated on start: 1400 adds Courses and moves every Planned Meal, Leftover and Slot Rule to the main Course, 1410 renames the Advance Step reminders already sent so they are not sent again, 1430 adds the detail Review Exclusions reads, and 1440 adds Tag colours and turns Tags into entities: it gives every key that only a Slot Rule or Variety Rule names a Tag of its own, so existing rules keep working. Migrations cannot be undone.

If the database holds Planned Meals, Feeder first saves a checked copy of it as `feeder-pre-1400.db` in the `backups` folder of the data volume (`/data/backups`). It is not listed in Settings, the nightly clean-up does not remove it, and a fresh install takes none. If the copy cannot be written, Feeder stops with a log line naming the file and migrates nothing.

To go back to 1.0.0-beta.3, stop Feeder, copy `feeder-pre-1400.db` over `feeder.db` (and delete `feeder.db-wal` and `feeder.db-shm`), then start the older image. Everything you changed after the upgrade is lost. Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.4 --namespace feeder --reset-then-reuse-values`; the steps are in the deploy guide, "Upgrading from 1.0.0-beta.3 to 1.0.0-beta.4".

## [1.0.0-beta.3] - 2026-11-11

The Pantry, with Storage Places and a frozen Shelf Life, and Recipe Assistant reads that work again.

### Added

- **Pantry.** The Stock page is now the Pantry. It lists every Stock Lot by Storage Place, with search, filters (Use soon, Spoiled, Storage Places, kinds) and sorting (good until, name, quantity, bought, Storage Place). "By Ingredient" keeps the per-Ingredient totals.
- **Storage Places.** Add places such as Kitchen Pantry, Garage Fridge or Garage Freezer in Settings, each a pantry, fridge or freezer, and pick a default. New Stock goes where that Ingredient was last put. Move a Stock Lot, or part of it, from its sheet on the Pantry page.
- **Frozen Shelf Life.** An Ingredient can say how long it keeps frozen. A Stock Lot moved into a Freezer is good for that long from the day it goes in; out of the Freezer, its ordinary Shelf Life starts again.

### Fixed

- **Recipe Assistant reads.** Reading a recipe failed with "Couldn't reach Recipe Assistant" although the connection test passed. The Anthropic API refused the answer format as too complex after about 3 minutes, and Feeder gave up waiting at 2. The answer format now asks for every field, with an explicit "none" for what a recipe leaves out, so a read takes seconds. Reads also stream, so a long answer is no longer cut off at 2 minutes, and a whole read may now take up to 5. The server log names the API's reason when a call is refused.

### Upgrading

No new settings. The database gains Storage Places and the frozen Shelf Life on start (migration 1330); existing Stock Lots are not sorted until moved. Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.3 --namespace feeder --reset-then-reuse-values`. If an ingress or proxy in front of Feeder limits request time, reads no longer depend on it: the server works on them in the background for up to 5 minutes.

## [1.0.0-beta.2] - 2026-11-11

Any User can add a Shop, Feeder finds the Shop you are in, and Cook Mode follows the order of the Steps.

### Added

- **Any User adds a Shop.** Add a Shop from Settings, from the Shop select on the Shop screen, or with "Add the Shop I am in" on the Scan picker. Renaming and deleting a Shop stay with the Admin.
- **Shop Location.** Adding a Shop offers to save where you are as its Shop Location, and any User can save it later on the Shop's page. Feeder then finds the Shop you are in: the Scan picker lists it first, a Scan session started with another Shop offers to switch, and the Shop screen prices the list there (with Undo). Feeder asks for your location only when you tap, unless your browser already allows it, and your position itself is not stored.

### Fixed

- **Cook Mode follows Step order.** Next is held while a Step that the next one depends on (its "After step" setting) still has its timer running, for example "Put the meat in the oven" while "Pre-heat the oven" counts down. A line says what Next is held for and how long is left; cancelling that timer, or letting it finish, frees Next.

### Upgrading

No new settings. The database gains the Shop Location columns on start (migration 1320). Upgrade with `helm upgrade feeder oci://ghcr.io/fabbarix/charts/feeder --version 1.0.0-beta.2 --namespace feeder --reset-then-reuse-values`. Feeder asks for the phone's location only over HTTPS (or on localhost).

## [1.0.0-beta.1] - 2026-11-10

The first beta. It adds the Recipe Assistant, Access Requests, Photos for Members, Pictures for Ingredients, Pictures on Products and across the app, a redesigned Recipe editor and Recipe detail, drag to reorder, and a round of layout polish.

### Added

- **Recipe Assistant.** Read a recipe from a web address or pasted text, or read it from a photo, and review the result before it becomes a Recipe. An Admin sets it up in Settings with an API key; the key is stored encrypted. It needs the new `FEEDER_SECRET_KEY` setting (see the upgrade note below), and it stays off without it.
- **Access Requests.** Someone who is not yet on the Allowlist can ask to join. Any User sees a Sign-in requests row and can approve or deny a request from a sheet; the Admin manages everyone on the new Allowlist page. Members now have an email address, and an Admin can turn the notification for new requests on or off.
- **Photos and Pictures.** A Member has a Photo and an Ingredient has a Picture. One shared ImagePicker handles crop, camera, paste and web address everywhere a picture is chosen. HEIC photos (iPhone) are converted on the server, with "Converting photo…" progress.
- **Pictures everywhere.** Ingredient and Product Pictures and Member Avatars now show wherever they are named: in pickers and lists, in Plan, Stock, Shop and Scan, and in Settings. A Member without a Photo shows their emoji, then their initials. The Recipe editor also shows the Recipe's and Steps' Photos, and Save waits until every Photo is stored.
- **Product pictures.** A Product has a Picture too, chosen with the same ImagePicker, and Scan shows it.
- **Picture on a merged Scan.** When you Scan an unknown barcode that is already on a Product (another phone added it first), your Scan merges into that Product. If the Product has no Picture, it takes yours; a Product that already has a Picture keeps it.
- **Picture on an offline Scan.** The unknown-barcode form keeps its Picture field when the phone is offline. The Picture is queued with the Scan and uploaded when the Scan syncs. A Picture that cannot be uploaded (too large, unsupported, or gone) is dropped and the Scan still syncs, with a notice.
- **Pictures from a Recipe File.** When a Recipe File brings in a picture for an Ingredient you already have, that Ingredient adopts it instead of staying without one.
- **Drag to reorder.** Drag the handle to reorder the Ingredient lines and the Steps of a Recipe, or reorder them from the keyboard. Optional now lives in the line's actions menu.
- **Recipe editor and detail redesign.** A centred editor with sections, compact fields and sticky bars, a button for the Recipe's actions, a plain information message, and a clearer warning symbol. Recipe detail follows the same look.
- **Inline Ingredient creation.** The Recipe editor can create an Ingredient on the spot with a New Ingredient sheet, including Ready Meal Ingredients. Saving a Recipe with a name that is already taken now says so clearly, offers to rename, and pack sizes have a hint next to the Quantity.
- **Reheat for Leftovers.** Each Recipe can have its own reheat time, and a Planned Meal served from a Leftover shows a Reheat step in the cook preview.
- **Zero-waste streak.** The streak counts days without waste: no Stock Lot going off and no Leftover discarded after its Use-by. Choosing Keep on a spoiled Stock Lot does not break it, nothing is counted twice, and the count is capped by the Household's age.
- **Multi-day Meal Slot edit.** Edit a Meal Slot for several weekdays at once with the new weekday picker, see who attends with attendee pills, and use the week grid of Meal Slots in Settings. A new slot defaults to everyone attending.
- **Couldn't plan, grouped by cause.** When a Plan cannot fill a slot, the reasons are grouped by cause, each with a fix, and a setup checklist shows what is still missing. A replan runs when the server starts.
- **Third-party notices.** `THIRD_PARTY_NOTICES.md` lists every open-source component with its licence, and the container image carries a copy.
- **Release files.** This changelog, plus a deploy guide section for prereleases and for upgrading from 1.0.0-dev.

### Changed

- **Settings.** A new Settings shell with Breadcrumbs, a sheet for editing Members, and a link from an Admin to their own row in the Members list. The Plan and Cook Mode screens have clearer contrast, a board time, and a Today/Cook Mode layout; the cook preview shows the Leftover date.
- **Screens on the shared layout.** Stock has two columns with a sticky filter aside on wide screens, and its Throw out or keep? rows keep their actions in line. Shop tiles fill the width. Scan, Cook Mode, the board and Import use the shared page header, empty state and action bars; Cook Mode fills the phone screen with sticky Back and Next, and the board has two columns on phones. Scan warns about a near-duplicate Ingredient before it is created. Settings and the catalogue use the same blocks, the Recipe Assistant has its own row in Settings, and a Weight rule error is tied to its field.
- **Go 1.26.11.** The server is built with Go 1.26.11 (the latest 1.26 release), in `go.mod`, the Dockerfile and the docs.
- **Layout.** Pages have set widths, the Settings and form fields share sizes, one focus ring, muted look for controls that cannot be used, and sticky action bars. The side rail has better contrast and a compact ring for the current page. Time fields fit their digits.
- **Today and Plan.** The Plan shows 7 columns on a 1440 px screen, and Today uses the wide screen with a larger main tile.
- **Icon styles.** Only the icon styles in use are shipped, which keeps the icon payload under 42 kB.
- **Deploy.** Images and the Helm chart are published from `v*` tags only. Prereleases (`-beta.N`, `-rc.N`) do not get the `latest`, `1.0` or `1` tags. The Helm chart creates the `FEEDER_SECRET_KEY` Secret for you and keeps it, and the ingress body limit (`proxy-body-size`) is now `50m` so photos of up to 45 MiB get through. `FEEDER_TRUST_PROXY` (new in this release line, set automatically by the chart when the Ingress is on) takes the client address from the last `X-Forwarded-For` value for the sign-in rate limits.
- **Good until.** Stock, Use soon and the notification now name the last good day of a Stock Lot: "Good until today", "Good until tomorrow", "Good until Thu" or, a week or more ahead, "Good until 16 Nov". A Stock Lot that has gone off still says "Went off yesterday" or "Went off 3 days ago".
- **Plan chip.** The chip on a Planned Meal that uses up Stock now reads "uses spinach by Thu" instead of "uses spinach before Thu", which pointed a day too early.

### Fixed

- Toasts no longer fire after their screen is closed.
- The Recipe Assistant handles oversize photos, a read that is cancelled late, and slow connections with a clear message instead of a stuck screen.
- Cancelling a read in the Recipe Assistant frees its slot at once, so the next read starts straight away.
- Several layout fixes: long emails in the approve sheet, the stepper inside its frame, phone layouts for the Allowlist and Sign-in requests.
- Today after an offline reload shows the right date and a "Today could not be loaded." message with Try again, instead of "NaN" and "Nothing on the menu".
- The zero-waste streak on Today and the board updates as soon as you Keep or Throw out a Stock Lot.
- The streak refreshes when Stock changes on another device.
- Today's Try again reloads everything.
- Plan offline shows "The plan could not be loaded." with Try again.
- "Stock about to spoil" notifications now arrive on the go-off date, the last day the Stock Lot is good. They read "Spinach is good until today and no Planned Meal uses it" and still go out at 10:00.
- "Went off" on a spoiled Stock Lot now counts from the day after its go-off date, as the streak does.
- A Planned Meal served from a Leftover no longer says "0 Batches" in its sheet.
- The Ingredient Shelf Life stepper fits its tile on a phone, and the board's Timers tile ends long names with an ellipsis.
- The web app manifest is served with the right type and names the app's logo, so the app can be installed.
- Better contrast for the Preferences preview chip and the "Notifications are blocked" message.
- Add ingredient in the Recipe editor moves focus to the new line's Ingredient picker.

### Upgrade note (from 1.0.0-dev)

1. Copy `/data` first (an Admin can also take a snapshot in the app). Migrations run on start and cannot be undone; to go back, restore the snapshot and run the older image.
2. **New setting `FEEDER_SECRET_KEY`.** On Kubernetes the chart generates it and keeps it (`secretKey.generate`, default on); upgrade with `helm upgrade --reset-then-reuse-values` (Helm 3.14 or newer), which applies the new chart defaults first and then your own overrides, so the new default applies. Carrying the old values over unchanged creates no key. Under Argo CD or `helm template`, set `secretKey.existingSecret` instead. With docker or compose, set `FEEDER_SECRET_KEY` to the output of `openssl rand -base64 32`. Without it the app runs as before and the Recipe Assistant stays off. If the key is ever lost, an Admin re-enters the API key.
3. `FEEDER_TRUST_PROXY` is set by the chart. If you run your own proxy, see the deploy guide.
4. The ingress `proxy-body-size` is now `50m`; set the same limit in any other reverse proxy (`client_max_body_size 50m` for nginx).
5. Prerelease charts need an explicit version: `--version 1.0.0-beta.1`.

See `docs/dev/deploy.md` for details.

## [1.0.0-dev]

The baseline prerelease: weekly planning, shopping lists, Cook Mode, Leftover tracking, Google sign-in and Web Push, as one container with its data on one volume.

[Unreleased]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.6...HEAD
[1.0.0-beta.6]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.5.1...v1.0.0-beta.6
[1.0.0-beta.5.1]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.5...v1.0.0-beta.5.1
[1.0.0-beta.5]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.4.2...v1.0.0-beta.5
[1.0.0-beta.4.2]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.4.1...v1.0.0-beta.4.2
[1.0.0-beta.4.1]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.4...v1.0.0-beta.4.1
[1.0.0-beta.4]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.3...v1.0.0-beta.4
[1.0.0-beta.3]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.2...v1.0.0-beta.3
[1.0.0-beta.2]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.1...v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-dev...v1.0.0-beta.1
[1.0.0-dev]: https://github.com/fabbarix/feeder-ng/releases/tag/v1.0.0-dev
