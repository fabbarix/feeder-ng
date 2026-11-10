# R6: drop the per-User secondary colour

Decision (product owner, 2026-11-10): Preferences are scheme, accent and units. The optional secondary colour is removed (spec §14, §15 item 20).

## Scope
- Docs: spec §14 and §15, ux-brief colour line, ui-fix-plan Switch example. GLOSSARY has no mention. The `secondary` button variant and the `--color-secondary*` CSS aliases are unrelated and stay.
- Go: `household.Preferences` loses `Secondary`; store reads and writes scheme, accent, units; the HTTP body is `{scheme, accent, units}`.
- Web: `Preferences` type, `DEFAULT_PREFERENCES`, `preferencesChanged`, `PreferencesForm` (no checkbox, no colour input), `usePreferenceTheme` (returns `{accent, scheme}`), `PreferenceThemeProvider`, `ThemeProvider` props, `ThemeInput` (accent only), `useBoardPalette`, settings strings (`useSecondary`, `secondary`).
- `COLOR_ALIASES` keeps `secondary`, `on-secondary`, `secondary-container`, `on-secondary-container`: they map to accent tokens and `styles.css` and the secondary button still use them. Only the per-User input path goes.

## Stored column: drop it (migration 1120)
`1120_drop_preferences_secondary.sql`: `ALTER TABLE user_preferences DROP COLUMN secondary;`.
- modernc.org/sqlite v1.62.0 bundles SQLite well above 3.35, which added DROP COLUMN.
- DROP COLUMN fails if the column is indexed, in a constraint, or a key; `secondary TEXT` (0100_household.sql) is a plain nullable column with no index, CHECK, or foreign key, and no view or trigger uses it.
- Cleaner than leaving a dead column that every later reader must remember to ignore; no table rebuild and no `foreign-keys=off` directive needed. Rows keep scheme, accent, units.
- Rollback is not supported by the migration runner anyway (forward-only), and the data is a cosmetic preference.

## API: ignore, do not reject
`PUT /api/me/preferences` ignores an unknown `secondary` (value, null or malformed) so cached or old clients keep saving. The response and GET never include it. (`httpx.DecodeJSON` already tolerates unknown fields; the handler simply stops reading it.)

## Tests (written first, red until implemented)
- `internal/db/drop_secondary_test.go`: column gone after 1120, other preferences kept.
- `internal/household/httpapi/preferences_test.go`: `TestPreferencesIgnoreRemovedSecondary` (200 for "#ffb4a2", "red", null; no `secondary` in PUT or GET bodies).
- Go domain/store tests no longer use `Secondary` (they compile now; the migration and API tests are the red ones).
- BDD `preferences.feature`: old client's secondary ignored; new step `the response JSON has no field "<key>"` in `bdd/steps_household_test.go`.
- vitest: PreferencesForm has no secondary control and saves only scheme/accent/units; `usePreferenceTheme` drops a server-sent secondary; palette test uses `@ts-expect-error` (red under tsc until `ThemeInput.secondary` is removed). DEFAULT_PREFERENCES has no `secondary`.
