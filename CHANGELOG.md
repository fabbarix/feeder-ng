# Changelog

All notable changes to the Feeder are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Prereleases are tagged `-beta.N`, then `-rc.N`, before the stable `1.0.0`.

## [Unreleased]

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

[Unreleased]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.4.2...HEAD
[1.0.0-beta.4.2]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.4.1...v1.0.0-beta.4.2
[1.0.0-beta.4.1]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.4...v1.0.0-beta.4.1
[1.0.0-beta.4]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.3...v1.0.0-beta.4
[1.0.0-beta.3]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.2...v1.0.0-beta.3
[1.0.0-beta.2]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.1...v1.0.0-beta.2
[1.0.0-beta.1]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-dev...v1.0.0-beta.1
[1.0.0-dev]: https://github.com/fabbarix/feeder-ng/releases/tag/v1.0.0-dev
