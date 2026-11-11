# Changelog

All notable changes to the Feeder are listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Prereleases are tagged `-beta.N`, then `-rc.N`, before the stable `1.0.0`.

## [Unreleased]

Nothing yet.

## [1.0.0-beta.1] - 2026-11-10

The first beta. It adds the Recipe Assistant, Access Requests, Photos for Members, Pictures for Ingredients, a new Recipe editor and a round of layout polish.

### Added

- **Recipe Assistant.** Read a recipe from a web address or pasted text, or read it from a photo, and review the result before it becomes a Recipe. An Admin sets it up in Settings with an API key; the key is stored encrypted. It needs the new `FEEDER_SECRET_KEY` setting (see the upgrade note below), and it stays off without it.
- **Access Requests.** Someone who is not yet on the Allowlist can ask to join. Any User sees a Sign-in requests row and can approve or deny a request from a sheet; the Admin manages everyone on the new Allowlist page. Members now have an email address, and an Admin can turn the notification for new requests on or off.
- **Photos and Pictures.** A Member has a Photo and an Ingredient has a Picture. One shared ImagePicker handles crop, camera, paste and web address everywhere a picture is chosen. Photos in HEIC format are not accepted yet.
- **Inline Ingredient creation.** The Recipe editor can create an Ingredient on the spot with a New Ingredient sheet, including Ready Meal Ingredients. Saving a Recipe with a name that is already taken now says so clearly, offers to rename, and pack sizes have a hint next to the Quantity.
- **Reheat for Leftovers.** Each Recipe can have its own reheat time, and a Planned Meal served from a Leftover shows a Reheat step in the cook preview.
- **Zero-waste streak.** The streak counts days without a Leftover going off. Keeping a Leftover does not break it, nothing is counted twice, and the count is capped by the Household's age.
- **Multi-day Meal Slot edit.** Edit a Meal Slot for several weekdays at once with the new weekday picker, see who attends with attendee pills, and use the week grid of Meal Slots in Settings. A new slot defaults to everyone attending.
- **Couldn't plan, grouped by cause.** When a Plan cannot fill a slot, the reasons are grouped by cause, each with a fix, and a setup checklist shows what is still missing. A replan runs when the server starts.
- **Third-party notices.** `THIRD_PARTY_NOTICES.md` lists every open-source component with its licence, and the container image carries a copy.
- **Release files.** This changelog, plus a deploy guide section for prereleases and for upgrading from 1.0.0-dev.

### Changed

- **Settings.** A new Settings shell with Breadcrumbs, a sheet for editing Members, and a link from an Admin to their own row in the Members list. The Plan and Cook screens have clearer contrast, a board time, and a Today/Cook layout; the cook preview shows the Leftover date.
- **Screens on the shared layout.** Stock has two columns with a sticky filter aside on wide screens, and its Throw out or keep? rows keep their actions in line. Shop tiles fill the width. Scan, Cook, the board and Import use the shared page header, empty state and action bars; Cook fills the phone screen with sticky Back and Next, and the board has two columns on phones. Scan warns about a near-duplicate Ingredient before it is created. Settings and the catalogue use the same blocks, the Recipe Assistant has its own row in Settings, and a Weight rule error is tied to its field.
- **Go 1.26.11.** The server is built with Go 1.26.11 (the latest 1.26 release), in `go.mod`, the Dockerfile and the docs.
- **Layout.** Pages have set widths, the Settings and form fields share sizes, one focus ring, muted look for controls that cannot be used, and sticky action bars. The side rail has better contrast and a compact ring for the current page. Time fields fit their digits.
- **Icon styles.** Only the icon styles in use are shipped, which keeps the icon payload under 42 kB.
- **Deploy.** Images and the Helm chart are published from `v*` tags only. Prereleases (`-beta.N`, `-rc.N`) do not get the `latest`, `1.0` or `1` tags. The Helm chart creates the `FEEDER_SECRET_KEY` Secret for you and keeps it, and the ingress body limit (`proxy-body-size`) is now `50m` so photos of up to 45 MiB get through. `FEEDER_TRUST_PROXY` (new in this release line, set automatically by the chart when the Ingress is on) takes the client address from the last `X-Forwarded-For` value for the sign-in rate limits.

### Fixed

- Toasts no longer fire after their screen is closed.
- The Recipe Assistant handles oversize photos, a read that is cancelled late, and slow connections with a clear message instead of a stuck screen.
- Several layout fixes: long emails in the approve sheet, the stepper inside its frame, phone layouts for the Allowlist and Sign-in requests.

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
