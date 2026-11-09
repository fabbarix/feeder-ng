# T1 auth + household: design

Scope: functional-spec §2 (access), §3 (household setup), §14 (per-User theming and units). Contract: [../architecture.md](../architecture.md), extension points in [t0-foundation.md](t0-foundation.md). Tests are written first (red); the Developer implements until `scripts/check.sh` passes. Spec source: the product-owner decisions on `team/t7-spec-decisions` (Planner Style position, Location, Currency, metric/imperial).

## Decisions taken
- **Google sign-in** uses `golang.org/x/oauth2` with scopes `openid email profile`, `state` and PKCE (S256), and reads the identity from the OpenID `userinfo` endpoint (HTTPS to Google, so no id_token signature handling). A User must have `email_verified=true` and be on the allowlist.
- **Injectable provider**: handlers talk to an `auth.Provider` interface. `httpapi.SetProvider(p) (restore func())` swaps it (test seam, read at request time). Tests use `authtest.Fake`, which also verifies the PKCE verifier. The real `auth.GoogleProvider` is tested against an `httptest` server that imitates Google's token and userinfo endpoints (`WithGoogleEndpoints`). Real Google is never contacted. Without `FEEDER_GOOGLE_CLIENT_ID` and no override, `GET /auth/google/login` answers 503 `google_not_configured`.
- **Flow state** lives in a 10-minute HttpOnly, SameSite=Lax cookie `feeder_oauth` (value `<state>.<verifier>`, path `/auth/google`), cleared by the callback.
- **Callback outcomes** are browser redirects: success -> `/` with the session cookie; Google email not on the allowlist or not verified -> `/not-invited` (no session); user cancelled (`error=access_denied`) -> `/sign-in?error=denied`; missing/mismatched state, missing flow cookie, exchange failure -> `/sign-in?error=failed`. The SPA serves `/sign-in` and `/not-invited` (the signed-out shell renders them by path; signed-in visits redirect to `/`).
- On first sign-in a User whose display name is still the e-mail local part gets Google's `name`.
- **Allowlist** = the `users` table (T0). New `auth.Service` methods: `ListUsers`, `SetAdmin`, `RemoveUser`, `SetDisplayName`, `NormalizeEmail`; sentinel `ErrLastAdmin` (removing or demoting the only Admin) and `ErrInvalidEmail`. `RemoveUser` ends sessions via the existing `DeleteUser` (cascade + revocation hook).
- **Weekdays** are ISO numbers 1 (Monday) to 7 (Sunday), matching the ISO-week rule in the spec.
- **Attendance override replaces** the slot's usual Attendance for that date wholesale (not a diff). Its date must fall on the slot's weekday (`weekday_mismatch`).
- **Settings singleton**: one row, created by the migration with time zone `UTC` and `time_zone_configured=0`. The first Admin visit to Settings sends the browser's zone (`Intl`) when `timeZoneConfigured` is false; saving marks it configured. Bounds not fixed by the spec: Default Cool-down 0-365 days, Default Leftover Use-by 1-14 days, quiet hours start != end. Planning Horizon 1-28 and Portion Factor 0.25-3 in 0.25 steps are from the spec. The household package imports `time/tzdata` so zones validate on a minimal image.
- **Preferences** are per User; absent row = defaults (`system`, accent `#3f7d58`, no secondary, `metric`). Imperial is stored only; conversion helpers belong to whoever shows quantities (stored values stay metric).
- Live updates: every write publishes `household` on the event bus with `{"changed":"settings|members|mealSlots|attendance"}`.
- Errors: `validation_failed` (422, message starts with the JSON field name), `unknown_member`, `duplicate_attendee`, `weekday_mismatch` (422); `email_taken`, `last_admin`, `user_already_linked`, `duplicate_slot` (409); `not_found` (404).

## Data model (migration `internal/db/migrations/0100_household.sql`)
```sql
CREATE TABLE household_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  time_zone TEXT NOT NULL DEFAULT 'UTC', time_zone_configured INTEGER NOT NULL DEFAULT 0,
  planning_horizon_days INTEGER NOT NULL DEFAULT 7, default_cooldown_days INTEGER NOT NULL DEFAULT 7,
  default_leftover_use_by_days INTEGER NOT NULL DEFAULT 3,
  quiet_hours_start TEXT NOT NULL DEFAULT '22:00', quiet_hours_end TEXT NOT NULL DEFAULT '07:00',
  planner_style REAL NOT NULL DEFAULT 0.5 CHECK (planner_style BETWEEN 0 AND 1),
  location_city TEXT, location_latitude REAL, location_longitude REAL,
  currency TEXT NOT NULL DEFAULT 'USD');
INSERT INTO household_settings (id) VALUES (1);
CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT NOT NULL, colour TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '',
  portion_factor REAL NOT NULL, user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL, created_at TEXT NOT NULL);
CREATE TABLE meal_slots (id INTEGER PRIMARY KEY, weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  name TEXT NOT NULL COLLATE NOCASE, time TEXT NOT NULL, UNIQUE (weekday, name));
CREATE TABLE meal_slot_attendees (slot_id INTEGER NOT NULL REFERENCES meal_slots(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE, portion_factor_override REAL,
  PRIMARY KEY (slot_id, member_id));
CREATE TABLE attendance_overrides (slot_id INTEGER NOT NULL REFERENCES meal_slots(id) ON DELETE CASCADE,
  date TEXT NOT NULL, PRIMARY KEY (slot_id, date));
CREATE TABLE attendance_override_attendees (slot_id INTEGER NOT NULL, date TEXT NOT NULL,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE, portion_factor_override REAL,
  PRIMARY KEY (slot_id, date, member_id),
  FOREIGN KEY (slot_id, date) REFERENCES attendance_overrides(slot_id, date) ON DELETE CASCADE);
CREATE TABLE user_preferences (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  scheme TEXT NOT NULL DEFAULT 'system', accent TEXT NOT NULL DEFAULT '#3f7d58', secondary TEXT,
  units TEXT NOT NULL DEFAULT 'metric');
```
(An override with zero attendees is valid: "nobody eats at home Thursday".)

## Backend packages
| Package | Contents |
|---|---|
| `internal/auth` (extended) | `provider.go` (`Identity`, `Provider`), `oauth.go` (`Flow`, PKCE), `google.go` (`GoogleProvider`), `allowlist.go` (`ListUsers`, `SetAdmin`, `RemoveUser`, `SetDisplayName`, `NormalizeEmail`, `ErrLastAdmin`, `ErrInvalidEmail`) |
| `internal/auth/authtest` | `Fake` provider for tests (verifies PKCE, records exchanges) |
| `internal/auth/httpapi` (extended) | `google.go` (`/auth/google/login`, `/auth/google/callback`, `SetProvider`), `allowlist.go` |
| `internal/household` (pure) | `Settings`, `QuietHours`, `Location`, `Member`, `MemberInput`, `MealSlot`, `MealSlotInput`, `Attendee`, `Preferences`, validation, `PortionsNeeded`, `ResolveAttendance`, `WeekdayOf`, sentinels |
| `internal/household/store` | `Store` over SQLite |
| `internal/household/httpapi` | module `household`, registered in `internal/modules/household.go` |

### Key signatures (tests rely on these)
```go
// household
func DefaultSettings(timeZone string) Settings          // 7/7/3, 22:00-07:00, 0.5, USD, no Location, TimeZoneConfigured=false
func (s Settings) Validate() error                      // *ValidationError{Field: json name}
func (s Settings) Normalized() Settings                 // trims city, upper-cases currency
func (q QuietHours) Contains(hhmm string) bool          // wraps midnight; start inclusive, end exclusive
func ValidatePortionFactor(f float64) error             // 0.25..3 in 0.25 steps -> *ValidationError{Field:"portionFactor"}
func (m MemberInput) Validate() error                   // name 1-50 runes, colour #rrggbb, avatar <= 4 runes, factor
func (m MealSlotInput) Validate() error                 // weekday 1-7, name 1-50, time HH:MM, overrides valid, ErrDuplicateAttendee
func WeekdayOf(date string) (int, error)                // "2026-11-12" -> 4
func ValidateAttendanceDate(weekday int, date string) error // ErrWeekdayMismatch
func ResolveAttendance(usual, override []Attendee, hasOverride bool) []Attendee
func PortionsNeeded(members []Member, attendance []Attendee) (float64, error) // sum of effective factors; ErrUnknownMember
func EffectiveFactor(m Member, a Attendee) float64
func DefaultPreferences() Preferences; func (p Preferences) Validate() error
// auth
func NewFlow(r io.Reader) (Flow, error); func (f Flow) Challenge() string; func PKCEChallenge(verifier string) string
func (f Flow) Cookie(secure bool, now time.Time) *http.Cookie; func ParseFlowCookie(c *http.Cookie) (Flow, error); func (f Flow) Matches(state string) bool
func NewGoogleProvider(clientID, clientSecret string, opts ...GoogleOption) *GoogleProvider
// store: see store.go (Settings/SaveSettings, Members/CreateMember/UpdateMember/DeleteMember/LinkUser, Slots/Slot/CreateSlot/UpdateSlot/DeleteSlot, Attendance/SetAttendanceOverride/ClearAttendanceOverride, Preferences/SavePreferences)
```

## HTTP API (JSON, camelCase)
Public: `GET /auth/google/login`, `GET /auth/google/callback`.
Admin: `GET|POST /api/allowlist`, `PATCH|DELETE /api/allowlist/{id}`, `PUT /api/household/settings`, `POST /api/members`, `PATCH|DELETE /api/members/{id}`, `PUT /api/members/{id}/user`, `POST /api/meal-slots`, `PATCH|DELETE /api/meal-slots/{id}`.
User: `GET /api/household/settings`, `GET /api/members`, `GET /api/meal-slots`, `GET|PUT|DELETE /api/meal-slots/{id}/attendance?date=YYYY-MM-DD`, `GET|PUT /api/me/preferences`.
(The allowlist list is Admin-only, as it exposes everyone's e-mail.)

- Allowlist user: `{id,email,displayName,isAdmin}`. `POST {email,displayName?,isAdmin?}` -> 201. `PATCH {isAdmin}` -> 200.
- Settings: `{timeZone,timeZoneConfigured,planningHorizonDays,defaultCooldownDays,defaultLeftoverUseByDays,quietHours:{start,end},plannerStyle,location:null|{city}|{latitude,longitude},currency}`; `PUT` takes the same fields (without `timeZoneConfigured`, which becomes true).
- Member: `{id,name,colour,avatar,portionFactor,userId}`; `PUT /members/{id}/user {userId|null}`.
- Meal Slot: `{id,weekday,name,time,attendance:[{memberId,portionFactorOverride|null}],portionsNeeded}` (sorted weekday, time, name).
- Date Attendance: `{slotId,date,isOverride,attendance,portionsNeeded}`; `PUT {attendance}`; `DELETE` reverts to usual.
- Preferences: `{scheme:'light'|'dark'|'system',accent:'#rrggbb',secondary:null|'#rrggbb',units:'metric'|'imperial'}`.

## Frontend (`web/src/features/settings`, `web/src/features/signin`)
Shell files touched (minimal): `web/src/app/AppRoot.tsx` (signed-out branch renders `SignedOut` from the signin feature instead of the placeholder `EmptyState`) and `web/src/app/providers.tsx` (`ThemeProvider` replaced by `PreferenceThemeProvider`, which falls back to the default accent when signed out). No other shell file.

`signin/`: `index.ts` (routes `/sign-in`, `/not-invited` -> redirect to `/` when signed in), `strings.ts`, `lib/signedOutView.ts` (`signedOutView(pathname, search)`), `components/{SignInPage,NotInvitedPage,SignedOut}.tsx`.

`settings/`: `index.ts` (route `/settings`), `api.ts`, `types.ts`, `strings.ts`;
- `lib/`: `portions.ts` (`portionsNeeded`, `formatPortions`, `PORTION_STEP`), `settingsForm.ts` (`validateSettings`, `parseLocationInput`, `formatLocation`), `plannerStyle.ts` (`plannerStyleLabel`, `PLANNER_ANCHORS`), `weekdays.ts` (`WEEKDAYS`, `weekdayOfDate`, `nextDateForWeekday`), `timezone.ts` (`browserTimeZone`, `needsTimeZoneSetup`), `accents.ts` (`ACCENT_PRESETS`).
- `hooks/`: `useHouseholdSettings`, `useMembers`, `useMealSlots`, `useAttendance`, `useAllowlist`, `usePreferences`, `usePreferenceTheme`.
- `components/` (props-driven, composed from `ui/`: Tile, BentoGrid, Chip, Button, Stepper, BottomSheet, Avatar, EmptyState, useToast): `HouseholdSettingsForm`, `PlannerStyleSlider`, `MemberList`, `MemberEditor`, `MealSlotList`, `MealSlotEditor`, `AttendanceEditor`, `DateAttendancePanel`, `AllowlistPanel`, `PreferencesForm`, `PreferenceThemeProvider`, `SettingsPage`.
- Settings page order: household settings (Admin edits, others read), Members, Meal Slots (+ per-date Attendance), Allowlist (Admin only), Your preferences. UI says Member, Meal Slot, Attendance, Portion Factor, Planner Style, Planning Horizon, Admin, never the `_Avoid_` words.

## Tests (written first)
Go: `internal/household/*_test.go`, `internal/household/store/store_test.go`, `internal/household/httpapi/*_test.go`, `internal/auth/{oauth,google,allowlist}_test.go`, `internal/auth/httpapi/{google,allowlist}_test.go`.
Gherkin: `bdd/features/auth/{google_signin,allowlist}.feature`, `bdd/features/household/{settings,members,meal_slots,attendance,preferences}.feature`; steps in `bdd/steps_auth_test.go`, `bdd/steps_household_test.go` (registered as `auth` and `household`, step text specific to these features).
Vitest: `lib/*.test.ts`, `hooks/*.test.tsx`, `components/*.test.tsx`, `signin/**/*.test.*`.
