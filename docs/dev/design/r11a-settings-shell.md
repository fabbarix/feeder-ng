# R11a settings and shell fixes (design note)

Source: QA report round 2 (N5, N7 remainder, N8 settings/shell part, N10). Tests are written first and are red; the only production stubs are the type-only `triggerLabel` field and `ui/BackLink.tsx` (renders a bare link).

## Blocked on R11b's files (reported, no tests written)
`web/src/features/plan/**` belongs to R11b during this round. Two parts of the scope need it, so they are **not** done here:
- N5 "At most per week starts at 1": `plan/hooks/useRuleForms.ts` (`useState<number | null>(null)` -> `1`, and the reset after Add). Tests to write when plan is free: `useVarietyRuleForm` starts with `maxPerWeek === 1`; `VarietyRulesEditor` shows spinbutton value 1 and resets to 1 after saving. Product note: a Variety Rule with only "not on consecutive days" (no weekly cap) then needs the User to clear the field (null still means no cap); that stays allowed.
- N8 back control on Planning rules: `plan/screens/PlanningRulesScreen.tsx` should render `<PageHeader title=... leading={<BackLink to="/settings" label="Settings" />} />` and drop the stray bottom `<Link to="/plan">`. (The Meal Slot picker part of N5 lives in `ui/`, done below.)

## N5 closed Meal Slot picker
Cause: `mealSlotOptions` labels an option with the slot name only; the closed trigger shows `selectedOption.label`.
- `ui/Select/lib.ts`: `SelectOption.triggerLabel?: string` (added now, type only). `Select.tsx`: the closed trigger text is `selectedOption.triggerLabel ?? selectedOption.label` (single select only). The open list, search and type-ahead keep using `label`.
- `ui/Select/options.tsx` `mealSlotOptions`: `triggerLabel = \`${group.slice(0, 3)} · ${name}\`` ("Tue · Dinner"); works for localised `weekdayNames` ("Mar · Dinner"). This also fixes every other MealSlotSelect (Settings attendance, Slot Rules).
- Tests: `ui/Select/MealSlotSelect.test.tsx`.

## N7 copy
- Ingredient heading: `IngredientScreen.tsx` `<h1>{displayName(ingredient.name)}</h1>`, using the existing `ingredients/lib/names.ts` `displayName` that the list uses. Test: `IngredientScreen.test.tsx` ("Garlic"). Rename form keeps the stored lowercase name.
- Scan wording rule: **"scan" is lowercase everywhere except as a title or at the start of a sentence** (counts begin with a digit, so lowercase: "1 scan waiting to sync", "2 scans couldn't sync"). GLOSSARY keeps **Scan** as the domain term; this is a copy-casing rule for running text, like "recipe" in sentences. Files: `scan/strings.ts` (`queued`, `rejectedCount`; "Offline: scans are kept..." and "Couldn't sync a scan" already comply), `ui/OfflineBanner` copy (`"N scans waiting to sync"`, via `ui/strings.ts` or the component). Tests: `scan/strings.test.ts` (counts plus a scan that no string has "Scan" mid-sentence), `ScanScreen.test.tsx`, `ui/OfflineBanner.test.tsx`. Not changed: `products/strings.ts` archiveBody ("left out of lists and Scans"), a different feature; the reviewer may ask for the same rule there (its test is case-insensitive).

## N8 layout
- **Back control**: new shared primitive `ui/BackLink.tsx` + `BackLink.css`, exported from `ui/index.ts`. Props `{to, label}`. Renders `<Link className="back-link" to aria-label="Back to {label}">` with the Phosphor `back` icon and the visible `label`; `text-decoration: none`, `min-block-size: 44px`, tokens only. `uiStrings.backTo(label)`. `SettingsHeader` becomes `<PageHeader title leading={<BackLink to="/settings" label="Settings" />} />` (drop `settingsStrings.backToSettings` if unused). Tests: `ui/BackLink.test.tsx`, `settings/components/SettingsHeader.test.tsx`; `SettingsPages.test.tsx` still finds "Back to Settings".
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
Production: `web/src/ui/{BackLink.tsx,BackLink.css,index.ts,strings.ts,OfflineBanner.tsx,Select/Select.tsx,Select/options.tsx,fields/ColorSwatches.tsx,fields/ColorSwatches.css}`, `web/src/app/{nav.ts,shell.css?}`, `web/src/features/settings/components/SettingsHeader.tsx` (+ strings), `web/src/features/ingredients/screens/IngredientScreen.tsx`, `web/src/features/scan/strings.ts`, `web/public/favicon.svg`, `web/index.html`, `internal/app/spa.go`.
Tests (this commit): see the lines above plus `app/AppShell.test.tsx`, `bdd/features/foundation/health.feature`.
