# PN: Pantry in primary navigation

Request: "the stock management is currently hidden in the settings, it should be a first class citizen of the application, with a page of its own." The Pantry page exists (`/stock`, `/pantry`) but is only reachable from the avatar menu.

## Decisions

1. `PRIMARY_NAV` becomes Today, Plan, **Pantry**, Scan, Shop, Recipes. Pantry: id `pantry`, label `Pantry`, path `/pantry`, icon `stock`, not accent. `RAIL_NAV` is the same list, so the side rail gets Pantry in the same place.
2. `MENU_NAV` drops Pantry: Kitchen board, Settings (then feature items, Sign out).
3. `/pantry` is canonical. The **shell** owns the alias: `buildRoutes` adds `{ path: '/stock', element: <Navigate to="/pantry" replace /> }` (query and hash preserved; use `useLocation` to forward them). The stock feature drops its own `/stock` route and keeps `/pantry` and `/settings/storage-places`. This avoids a duplicate-route clash and works even when the stock feature is not loaded (placeholder at `/pantry`). Do not add a `/stock` row to `ROUTE_WIDTHS`.
4. Tab highlighting needs no code: `NavLink end` on `/pantry`; `/stock` lands on `/pantry` first, so Pantry is current. "No tab active" tests move to `/settings`.
5. `pageWidths.ts`: remove the `/stock` row, keep `/pantry` as `default`. `scripts/lib/page-layout-rules.mjs` ROUTES: `/stock` becomes `/pantry`. `scripts/check-page-layout.modes` fail_routes: `/stock` becomes `/pantry`.
6. Breadcrumbs: Pantry is a root destination with no trail (as before); `/pantry` added to the no-trail test. No change to `breadcrumbs.ts`.
7. `features.ts` placeholders come from `PRIMARY_NAV + MENU_NAV`, so `/pantry` gets "Coming soon" without a feature. Nothing to change there.
8. `web/src/features/stock/index.ts` comment ("already a fixed item of the avatar menu") must be updated.

## Six-button bottom bar (phones)

Today, Plan, Pantry | Scan | Shop, Recipes. Scan stays the accent 58 px button, in the bar, not raised.

Old rule: `justify-content: space-around`, links fixed 62 px. Six items need 5 x 62 + 58 = 368 px; the bar at 360 px is 336 px wide (12 px inset each side), 334 px inside the border. It does not fit, so the fixed width goes.

New layout: `display: grid; grid-template-columns: 1fr 1fr 1fr 58px 1.5fr 1.5fr; gap: 0; padding: 0`.

- Scan is **geometrically centred**. It has three buttons on its left and two on its right; equal fr weight on each side (3 x 1 = 2 x 1.5) puts its centre on the bar centre at every width.
- Widths at 360 px: Scan 58; left buttons (334 - 58) / 6 = 46.0 px each; right buttons 69.0 px each. Every button is at least 44 px wide (46 at 360, 47.5 at 375, 50 at 390, 53 at 412, 55.7 at 430) and 54 px high (Scan 58). The right-hand pair is wider than the left trio; its icons stay centred in their cells, so the visual spacing is slightly uneven. This is the price of a truly centred Scan. (The alternative, six equal cells, leaves Scan 28 px right of the centre at 360 px.)
- `.bottom-bar__link`: `width: 100%; min-width: 44px; height: 54px` (Scan keeps 58 x 58, set by its own rule). The grid track holds the width; `min-width` is a floor, never reached at 360 px and up.
- `.bottom-bar__label`: `white-space: nowrap`, no `text-overflow`, no `overflow` clipping. The longest left label, "Pantry" at 11 px / 800, is about 38 px, inside 46 px. "Recipes" is in a 69 px cell.
- Safe area: bottom stays `calc(var(--nav-inset) + env(safe-area-inset-bottom, 0px))`. New: `left: calc(var(--nav-inset) + env(safe-area-inset-left, 0px))` and `right: ... safe-area-inset-right`, so a landscape notch does not cover Today or Recipes. `--nav-clearance` is unchanged (height is still 70 px).
- Cap and centring unchanged: `max-width: 480px; margin-inline: auto`. At 430 px the bar is 406 px wide, fine; above 480 px the grid just spreads.
- Side rail: six 56 px items plus gaps (about 400 px) fit `max-height: 100dvh`; add `overflow-y: auto` so a short landscape screen scrolls rather than clips.

## Tests (red now)

- `nav.test.ts`: order, labels, paths, icon, accent, rail equals bar, menu has Kitchen board and Settings only.
- `AppShell.test.tsx`: bar and rail labels and icons, Pantry active on `/pantry` and `/stock`, query and hash kept, no tab active on `/settings`, menu items and focus order.
- `features.test.tsx`: `/stock` redirect with and without the feature, the stock feature has no `/stock` route, placeholder at `/pantry`.
- `pageWidths.test.ts`, `pageLayoutRules.test.ts`: `/pantry` listed, `/stock` row gone, modes file fails `/pantry`.
- `shell.css.test.ts`: grid with six tracks, Scan track fixed 58 px, fr balance, Scan centre = bar centre and every track >= 44 px at 360, 375, 390, 412, 430 (computed from the CSS), 44 px minimum, nowrap labels, safe-area left, right, bottom, rail scrolls.
- `scripts/test/check-shell-layout_test.sh`: the browser guard gains 360 and 430 viewports, `/pantry` in ROUTES (no `/stock`), and a documented rule 12.

Rule 12 for `scripts/check-shell-layout.mjs` (the developer adds it): at < 1024 px, the bar has six links; every link box is at least 44 x 44; the Scan link centre is within 1 px of the bar centre; no `.bottom-bar__label` has `scrollWidth > clientWidth` or a height above one line; the bar stays inside the viewport with safe-area insets. `/pantry` must show Pantry as `aria-current`.

## Spec text for the release team (do not apply here)

`docs/spec/functional-spec.md` §14 "Layout" (currently line 408): replace the bar list with

> Layout: Bento, as in the ux-brief. Phone uses a bottom bar of six buttons (Today · Plan · Pantry · Scan · Shop · Recipes; Scan is the accent button in the centre; "Shop" there is a UI label for the shopping screen, not the glossary **Shop**); desktop uses a side rail with the same six destinations and a wider grid; the tablet board is a separate route.

Pantry page paragraph (line 134): replace "(avatar menu "Pantry", routes `/stock` and `/pantry`)" with "(the Pantry tab of the bottom bar and side rail, route `/pantry`; `/stock` redirects to it)".

Other docs to update with the same change:
- `docs/design/ux-brief.md` line 17: "bottom bar with Today · Plan · Pantry · [Scan] · Shop · Recipes ... Stock and Settings sit behind the avatar" becomes "Settings and the Kitchen board sit behind the avatar".
- `docs/dev/architecture.md` line 46: bar list and "avatar menu -> Stock, Settings" become "... Pantry ...; avatar menu -> Kitchen board, Settings".
- GLOSSARY: no change (Pantry page is already defined).
