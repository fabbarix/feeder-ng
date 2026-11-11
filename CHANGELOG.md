# Changelog

All notable changes to the Feeder are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Prereleases are tagged `-beta.N`, then `-rc.N`, before the stable `1.0.0`.

## [Unreleased]

### Added

- **Tag suggestions.** While you type a Tag on a Recipe, the Tags the Household already uses are listed under the field with how many Recipes carry each; pick one with the arrows and Enter, or a tap. Typing an existing Tag in another spelling ("Pasta" for "pasta") picks that Tag, so no duplicate is made.

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

[Unreleased]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-beta.1...HEAD
[1.0.0-beta.1]: https://github.com/fabbarix/feeder-ng/compare/v1.0.0-dev...v1.0.0-beta.1
[1.0.0-dev]: https://github.com/fabbarix/feeder-ng/releases/tag/v1.0.0-dev
