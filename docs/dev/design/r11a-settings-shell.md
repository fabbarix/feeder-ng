# R11a settings and shell fixes (design note)

Source: QA report round 2 (N5, N7 remainder, N8 settings/shell part, N10). Tests are written first and are red; the only production stubs are the type-only `triggerLabel` field and `ui/BackLink.tsx` (renders a bare link).

## Planning rules (plan files, owned by R11a; R11b does not touch them)
- N5 "At most per week" starts at 1: `plan/hooks/useRuleForms.ts` `useState<number | null>(1)`, and the reset after Add sets it back to 1. Clearing the field still gives `null` = no cap (a rule with only "not on consecutive days"), so the User clears it to get that; submitting the untouched form now saves a limit of 1. Tests: `RulesEditors.test.tsx` (starts at 1 and resets to 1; default rule saves 1; the existing "saves a rule" and "names the first problem" tests clear the field first), `PlanningRulesScreen.test.tsx` (the saved body now has `maxPerWeek: 1`).
- N8 back control: `plan/screens/PlanningRulesScreen.tsx` renders `<PageHeader title=... leading={<BackLink to="/settings" label="Settings" />} />` and drops the bottom `<Link to="/plan">`. Test: `PlanningRulesScreen.test.tsx`.

## N5 closed Meal Slot picker
Cause: `mealSlotOptions` labels an option with the slot name only; the closed trigger shows `selectedOption.label`.
- `ui/Select/lib.ts`: `SelectOption.triggerLabel?: string` (added now, type only). `Select.tsx`: the closed trigger text is `selectedOption.triggerLabel ?? selectedOption.label` (single select only). The open list, search and type-ahead keep using `label`.
- `ui/Select/options.tsx` `mealSlotOptions`: `triggerLabel = \`${group.slice(0, 3)} · ${name}\`` ("Tue · Dinner"); works for localised `weekdayNames` ("Mar · Dinner"). This also fixes every other MealSlotSelect (Settings attendance, Slot Rules).
- Tests: `ui/Select/MealSlotSelect.test.tsx`.

## N7 copy
- Ingredient heading: `IngredientScreen.tsx` `<h1>{displayName(ingredient.name)}</h1>`, using the existing `ingredients/lib/names.ts` `displayName` that the list uses. Test: `IngredientScreen.test.tsx` ("Garlic"). Rename form keeps the stored lowercase name.
- Scan wording rule (PM decision, supersedes the first draft): **"Scan" is the GLOSSARY term and is capitalised everywhere, mid-sentence too**, as Shop, Stock, Lot, Recipe and Ingredient already are in the copy ("Pick the Shop", "in Stock", "Create Ingredient"). So "1 Scan waiting to sync", "2 Scans couldn't sync", "Offline: Scans are kept and sent...", "Couldn't sync a Scan: ...", products "left out of lists and Scans". The verb stays lowercase ("to scan"). Files: `scan/strings.ts` (`offline`, `rejected`; the counts are already capitalised), `ui/OfflineBanner` (already "Scans"). Tests: `scan/strings.test.ts` (no lowercase noun "scan(s)" in any string), `ScanScreen.test.tsx`, `ProductScreen.test.tsx` (case-sensitive now).

## N8 layout
- **Back control**: new shared primitive `ui/BackLink.tsx` + `BackLink.css`, exported from `ui/index.ts`. Props `{to, label}`. Renders `<Link className="back-link" to aria-label="Back to {label}">` with the Phosphor `back` icon and the visible `label`; `text-decoration: none`, `min-block-size: 44px`, tokens only. `uiStrings.backTo(label)`. `SettingsHeader` becomes `<PageHeader title leading={<BackLink to="/settings" label="Settings" />} />` (drop `settingsStrings.backToSettings` if unused). Tests: `ui/BackLink.test.tsx`, `settings/components/SettingsHeader.test.tsx`; `SettingsPages.test.tsx` still finds "Back to Settings".
- **Back control, send-back sweep** (every route in `settingsSections.ts` must have it; the first pass missed three):
  - `/settings/shops` (`ShopsScreen`): `<PageHeader title leading={<BackLink to="/settings" label="Settings" />} />`.
  - `/settings/shops/:id` (`ShopScreen`): the plain `<Link>{strings.backToShops}</Link>` in `leading` becomes `<BackLink to="/settings/shops" label="Shops" />` (accessible name stays "Back to Shops"; drop the `Link` import if unused). The not-found state's action link also becomes a `back-link` to `/settings/shops` named "Back to Shops" (`<BackLink>` as the `EmptyState` action).
  - `/settings/notifications` (`NotificationSettingsScreen`): the bare `<h1 className="notifications__title">` becomes `<PageHeader title={s.title} leading={<BackLink to="/settings" label="Settings" />} />` (or `SettingsHeader`), rendered in every state (loading, error, loaded); remove the now unused `.notifications__title` rule.
  - Already covered: Household, Members, Meal Slots, Allowlist, Your preferences (`SettingsHeader`), Planning rules (`PlanningRulesScreen`). No other `/settings/*` route exists (Shop Barcodes and Weight Barcode Rules live inside `/settings/shops/:id`).
  - Tests: `shops/screens/ShopsScreens.backlink.test.tsx`, `notifications/components/NotificationSettingsScreen.test.tsx`, and the sweep `settings/lib/settingsBackLinks.test.tsx` (renders every `settingsGroups(true)` path through the real feature routes and checks: a `back-link` "Back to Settings" with href `/settings` inside `.page-header__leading`, and exactly one "Back to ..." link on the page, so no old inline link remains).
- **Custom swatch**: the 7-letter "Custom" overline cannot fit a 40 px circle. The swatch shows the `appearance` (palette) icon; the word stays as `aria-label`. `ColorSwatches.tsx` drops `.colour-swatch__text` (and its CSS rule). Test: `ColorSwatches.test.tsx`.
- **Rail order**: `RAIL_NAV` = `PRIMARY_NAV` (Today, Plan, Scan, Shop, Recipes). The Scan accent button stays accent-filled but sits in bar order, not pulled to the top; `AppShell.tsx` rail styling must not assume Scan is first (check `shell.css` for `:first-child` rules). Tests: `app/nav.test.ts`, `AppShell.test.tsx` (rail).

## N10 unknown paths and favicon
`internal/app/spa.go`, after robots and before the index fallback:
- a path under `/.well-known/` -> 404;
- a path whose last segment has a file extension (`path.Ext` of the cleaned path non-empty) and that is not a file in the SPA FS -> 404 (`http.NotFound`, not the index); HEAD behaves the same;
- no extension -> index.html 200, as today (client routes).
- Favicon decision: **SVG only**. `web/public/favicon.svg` (the boot-screen mark: two concentric circles, `viewBox 0 0 24 24`, `currentColor` replaced by the brand green `#2a7f62` so it shows on any tab bar), copied to `dist` by Vite (no config needed, `public/` is the default), served by `http.ServeFileFS` as `image/svg+xml`. `index.html`: `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`. `/favicon.ico` stays a 404: every current browser reads the link, and a second raster asset is not worth carrying. The service-worker glob already precaches `*.svg`.
- Tests (Go, `internal/app/app_test.go`): `TestMissingFilesAndWellKnownAre404NotTheSPAIndex`, `TestClientRoutesWithoutAnExtensionStillGetTheSPAIndex` (green guard), `TestFaviconSVGIsServedAsAnImage`. Web: `app/favicon.test.ts`. BDD: `foundation/health.feature` outline "A missing file or a /.well-known path is a 404, not the app shell".

## Files
Production: `web/src/features/plan/{hooks/useRuleForms.ts,screens/PlanningRulesScreen.tsx}`, `web/src/ui/{BackLink.tsx,BackLink.css,index.ts,strings.ts,OfflineBanner.tsx,Select/Select.tsx,Select/options.tsx,fields/ColorSwatches.tsx,fields/ColorSwatches.css}`, `web/src/app/{nav.ts,shell.css?}`, `web/src/features/settings/components/SettingsHeader.tsx` (+ strings), `web/src/features/ingredients/screens/IngredientScreen.tsx`, `web/src/features/scan/strings.ts`, `web/public/favicon.svg`, `web/index.html`, `internal/app/spa.go`.
Tests (this commit): see the lines above plus `app/AppShell.test.tsx`, `bdd/features/foundation/health.feature`.
