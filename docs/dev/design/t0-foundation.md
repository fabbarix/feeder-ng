# T0 foundation: design

Scope: the repo scaffold every other team builds on. Contract: [../architecture.md](../architecture.md). Tests are written first (red); the Developer implements until `scripts/check.sh` passes.

## Decisions taken (deviations from / refinements of the contract)
- **Go version**: godog v0.16 pulls `go 1.26` into `go.mod`; the Dockerfile and CI use Go 1.26.11.
- **`internal/httpx`** (new leaf package) holds the JSON helpers (`WriteJSON`, `WriteError`, `DecodeJSON`, `APIError`). They cannot live in `internal/app` because `internal/auth` (imported by `app`) needs them.
- **Auth split**: `internal/auth` is the core (users, sessions, middleware, no routes). `internal/auth/httpapi` registers `/api/me`, `/api/logout`, `/api/dev/login` via `app.Register` (team T1 adds Google OAuth routes there).
- **Module imports**: instead of `cmd/feeder/modules_<feature>.go`, each feature gets one file `internal/modules/<feature>.go` that blank-imports its `httpapi` package. Both `cmd/feeder` and `internal/testkit` import `internal/modules`, so BDD and the real binary always run the same module set. Feature `httpapi` tests must be external test packages (`package httpapi_test`) to avoid an import cycle through testkit.
- **Registry is an object** (`app.Registry`) with a default instance behind `app.Register`, so it can be unit-tested without global state.
- **Migrations** live in `internal/db/migrations/NNNN_name.sql`. T0 ships `0001_auth.sql` (users, sessions).
- **Sessions**: a session is expired when `now >= expires_at`; token = 32 random bytes, base64url; only `sha256(token)` hex is stored. Sliding expiry writes are throttled: expiry and `last_seen` are only rewritten when `last_seen` is more than 1 minute old. Cookie name `feeder_session`.
- **Admin seeding**: `SeedAdmin` creates the user if absent, or promotes an existing user to Admin; display name defaults to the email local part. Emails are stored lower-cased and compared case-insensitively.
- **Nav**: the five primary destinations and the two avatar-menu destinations (Stock, Settings) are fixed in the shell; a feature's `navItems` can only add extra entries (`placement: 'menu'`). Phone label is "Shop" (UX brief) for the Shopping List.

## Backend interfaces

### `internal/clock`
```go
type Clock interface{ Now() time.Time }
type System struct{}                     // Now() = time.Now().UTC()
type Fake struct{ ... }                  // goroutine-safe
func NewFake(t time.Time) *Fake
func (f *Fake) Now() time.Time
func (f *Fake) Set(t time.Time)
func (f *Fake) Advance(d time.Duration)
```

### `internal/config`
```go
type Config struct {
    AdminEmail, DataDir, Addr, BaseURL, GoogleClientID, GoogleClientSecret string
    DevLogin bool
}
var ErrAdminEmailRequired error          // message contains "FEEDER_ADMIN_EMAIL"
func Load(getenv func(string) string) (Config, error)
func (c Config) DBPath() string          // DataDir/feeder.db
func (c Config) SecureCookies() bool     // BaseURL starts with https://
```
Defaults: `DataDir=/data`, `Addr=:8080`. `AdminEmail` is trimmed and lower-cased. `FEEDER_DEV_LOGIN` is true for `1`/`true`.

### `internal/db`
```go
func Open(path string) (*sql.DB, error)                       // WAL, foreign_keys=ON and busy_timeout on EVERY pooled connection; creates parent dir
func Migrate(ctx context.Context, d *sql.DB, fsys fs.FS) error // *.sql at fsys root, filename order, one transaction per file, recorded in schema_migrations(name PK, applied_at); idempotent; error names the failing file and rolls it back
func MigrateEmbedded(ctx context.Context, d *sql.DB) error     // Migrate over the embedded internal/db/migrations
```
Non-`.sql` entries are ignored.

### `internal/httpx`
```go
type APIError struct{ Status int; Code, Message string }       // implements error
func WriteJSON(w http.ResponseWriter, status int, v any)
func WriteError(w http.ResponseWriter, status int, code, message string) // {"error":{"code","message"}}
func WriteAPIError(w http.ResponseWriter, err error)           // APIError -> its status; anything else -> 500 "internal"
func DecodeJSON(r *http.Request, v any) error                  // 1 MiB cap; returns *APIError{400,"bad_request"} on empty/invalid JSON
```

### `internal/events`
```go
type Event struct{ Topic string; Data json.RawMessage }
type Bus struct{...}
func NewBus() *Bus
func (b *Bus) Publish(topic string, data any)                  // non-blocking; marshals data; a subscriber whose buffer (64) is full misses the event
func (b *Bus) Subscribe(topics ...string) (<-chan Event, func()) // no topics = all; the func cancels and closes the channel
func (b *Bus) Handler() http.Handler                            // SSE
```
**Revocation (spec §2: removal/logout ends access immediately).** Open streams must not outlive their session:
- `events.WithOwners(ctx, keys ...string) context.Context` tags a request; `Bus.Handler(opts ...HandlerOption)` registers the stream under those owner keys. `Bus.CloseOwner(key)` ends every stream with that key (the handler returns; no further events are written, including ones published after the call).
- `auth.UserKey(id) = "user:<id>"`; `auth.SessionKeyFrom(ctx)` = `"session:<row id>"` of the authenticated request (set by `RequireUser`/`RequireAdmin`). `Service.OnRevoke(fn func(key string))` registers a hook called by `DeleteUser` (user key), `EndSession` (session key) and when `Authenticate` deletes an expired session (session key).
- `app.New` wires `OnRevoke` to `Bus.CloseOwner` and mounts `GET /api/events` behind `RequireUser` plus a wrapper that applies `WithOwners(userKey, sessionKey)`.
- Second line of defence: `events.WithRevalidate(func(*http.Request) bool)` is checked at every ping (`events.WithPingInterval(d)` overrides the 25 s default); `false` ends the stream. `app.New` passes a check that re-runs session authentication.
- Tests: `internal/events/revoke_test.go`, `internal/auth/middleware_test.go` (hook), `internal/testkit/revocation_test.go` (end to end), BDD scenarios in `sessions.feature`.

SSE format: first write is `: connected\n\n` (flushed); then `event: <topic>\ndata: <json>\n\n`; `: ping\n\n` every 25 s. `?topics=plan,shopping` filters. Ends when the client disconnects. The app mounts it at `GET /api/events` behind `RequireUser`.

### `internal/auth`
```go
const CookieName = "feeder_session"; const SessionTTL = 30 * 24 * time.Hour
type User struct{ ID int64; Email, DisplayName string; IsAdmin bool; CreatedAt time.Time }
var ErrNotFound, ErrEmailTaken, ErrNoSession error
type Service struct{...}
func NewService(d *sql.DB, clk clock.Clock, secureCookies bool) *Service
func (s *Service) SeedAdmin(ctx, email string) (User, error)           // idempotent
func (s *Service) AddUser(ctx, email, displayName string, isAdmin bool) (User, error) // ErrEmailTaken
func (s *Service) UserByEmail(ctx, email string) (User, error)         // ErrNotFound
func (s *Service) DeleteUser(ctx, id int64) error                      // ErrNotFound; sessions go with it (ON DELETE CASCADE)
func (s *Service) CreateSession(ctx, userID int64) (token string, expiresAt time.Time, err error)
func (s *Service) Authenticate(ctx, token string) (User, error)        // ErrNoSession if unknown/expired; slides expiry to now+TTL
func (s *Service) EndSession(ctx, token string) error                  // idempotent
func (s *Service) SessionCookie(token string, expires time.Time) *http.Cookie // HttpOnly, SameSite=Lax, Path=/, Secure per ctor
func (s *Service) ClearCookie() *http.Cookie                           // MaxAge=-1
func (s *Service) RequireUser(next http.Handler) http.Handler          // 401 {"error":{"code":"unauthenticated"}}; re-sends cookie when expiry slid
func (s *Service) RequireAdmin(next http.Handler) http.Handler         // 401 as above; 403 code "forbidden"
func UserFrom(ctx context.Context) (User, bool)
func ContextWithUser(ctx context.Context, u User) context.Context
```
Tables: `users(id, email UNIQUE NOCASE, display_name, is_admin, created_at)` (a row = allowed to sign in); `sessions(id, token_hash UNIQUE, user_id -> users ON DELETE CASCADE, created_at, expires_at, last_seen)`.

### `internal/app`
```go
type Deps struct{ DB *sql.DB; Clock clock.Clock; Config config.Config; Events *events.Bus; Auth *auth.Service; Logger *slog.Logger }
type Module struct{ Name string; Mount func(r *Router, d Deps) }
type Registry struct{...}; func NewRegistry() *Registry
func (g *Registry) Register(m Module)   // panics on empty name, nil Mount, duplicate name
func (g *Registry) Modules() []Module   // sorted by Name
func Register(m Module)                 // default registry, for init()
type Router struct{...}                 // wraps *http.ServeMux; patterns are Go 1.22 "METHOD /path/{id}"
func (r *Router) Public(pattern string, h http.HandlerFunc)
func (r *Router) User(pattern string, h http.HandlerFunc)    // RequireUser
func (r *Router) Admin(pattern string, h http.HandlerFunc)   // RequireAdmin
type Option func(*options); func WithRegistry(g *Registry) Option
type App struct{ Handler http.Handler; Deps Deps }
func New(cfg config.Config, d *sql.DB, clk clock.Clock, spa fs.FS, opts ...Option) (*App, error) // builds Bus+Auth, seeds the Admin, mounts modules
```
Built-in routes: `GET /api/health` -> `200 {"status":"ok"}` (public); `GET /api/events` (User). Any other `/api/...` -> `404 {"error":{"code":"not_found",...}}`. Panics in handlers -> `500 {"error":{"code":"internal"}}`. Non-`/api` GET/HEAD: serve the file in `spa` if it exists, else `index.html`; if `index.html` is absent respond `503` plain text containing "frontend not built". Handlers get the current user with `auth.UserFrom(r.Context())`.

### `internal/auth/httpapi` (module "auth")
`GET /api/me` (User) -> `{"id","email","displayName","isAdmin"}`; `POST /api/logout` (public) -> 204, ends the session, clears the cookie; `POST /api/dev/login {"email"}` registered **only when** `Config.DevLogin`: 200 + cookie + `/api/me` body, 403 `not_allowed` for an email that is not on the allowlist.

### `internal/testkit`
```go
var StartTime = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
const AdminEmail = "admin@example.test"; const UserEmail = "user@example.test"
type TB interface{ Helper(); Fatalf(format string, args ...any); Cleanup(func()); TempDir() string } // *testing.T satisfies it; godog.TestingT does not, so the BDD World supplies its own
type Option func(*config.Config)
func WithConfig(f func(*config.Config)) Option
func Start(t TB, opts ...Option) *Env  // temp DataDir, migrated DB, Fake clock at StartTime, httptest server, seeds `Config.AdminEmail` (default `AdminEmail`, via the normal startup seeding) and `UserEmail` (non-admin); cleanup via t.Cleanup
type Env struct{ Config config.Config; DataDir string; DB *sql.DB; Clock *clock.Fake; App *app.App; Auth *auth.Service }
func (e *Env) URL() string
func (e *Env) Restart(t TB)            // new app+server on the same DB/data dir/clock (server URL changes; Clients follow)
func (e *Env) AddUser(t TB, email, name string, admin bool) auth.User
func (e *Env) Anonymous() *Client
func (e *Env) LoginAs(t TB, email string) *Client // session created directly, cookie in the jar, no Google
func (e *Env) LoginAdmin(t TB) *Client /* as Config.AdminEmail */; func (e *Env) LoginUser(t TB) *Client
type Client struct{...}                         // has a cookie jar; resolves base URL from the Env on every call
func (c *Client) Do(method, path string, body any) *Response // body: nil | []byte | string (raw) | any (JSON)
func (c *Client) Get(path) *Response; Post/Put/Patch(path, body); Delete(path)
func (c *Client) Cookie(name string) *http.Cookie
type Response struct{ Status int; Header http.Header; Body []byte }
func (r *Response) JSON(v any) error
func (r *Response) MustJSON(t TB, v any)
func (r *Response) ErrorCode() string          // "" if no {"error":{"code"}}
func (r *Response) String() string
```
Transport errors fail the test via the `TB` captured at `Start`.

### BDD harness (`bdd/`)
- `registry_test.go` (owned by T0, shared file): godog runs `bdd/features/**` through `go test` (`TestFeatures`, one subtest per scenario via `TestingT`). `InitializeScenario` is invoked per scenario and builds a fresh `*World`; the app is started lazily by the first step that needs it (so `Given a running Feeder with FEEDER_ADMIN_EMAIL ...` can set config first) using a scenario-scoped `TB` whose `Cleanup`s run in an `After` hook and whose `Fatalf` panics (godog turns that into a step failure).
```go
type World struct {
    TB      testkit.TB                 // scenario-scoped
    Env     *testkit.Env
    Client  *testkit.Client            // the "current" client (starts anonymous)
    Clients map[string]*testkit.Client // by email, for multi-user scenarios
    Last    *testkit.Response          // last response
    Vars    map[string]any             // scratch space for a feature's steps
    Setup   []func(*config.Config)     // config tweaks applied when the app is started
}
func (w *World) Ensure() *testkit.Env   // starts the app on first use; Client defaults to anonymous
type StepRegistrar func(sc *godog.ScenarioContext, w *World)
func RegisterSteps(name string, f StepRegistrar)   // call from init() in steps_<feature>_test.go; panics on duplicate name
```
- Common steps (`steps_common_test.go`, T0): `Given a running Feeder` / `Given a running Feeder with FEEDER_ADMIN_EMAIL "<email>"`; `Given I am signed in as the Admin` / `as the User` / `as "<email>"`; `Given "<email>" is on the allowlist`; `When I GET|DELETE "<path>"`; `When I POST|PUT|PATCH "<path>" with JSON:` (docstring); `Then the response status is <n>`; `Then the response JSON field "<path>" is "<value>"` / `is true|false`; `Then the error code is "<code>"`.
- Features: `bdd/features/<feature>/*.feature`; a feature's steps in `bdd/steps_<feature>_test.go`.

### Commands
- `scripts/check.sh`: `cd` to repo root; `mkdir -p build`; run everything through `tee build/check.log`; steps in order: `pnpm -C web install --frozen-lockfile`, `pnpm -C web typecheck`, `pnpm -C web test`, `pnpm -C web build`, `go vet ./...`, `go test ./...`; stops at the first failure (`set -euo pipefail`, `PIPESTATUS`) with non-zero exit; prints `CHECK PASSED` / `CHECK FAILED: <step>` last.
- `Makefile`: `check` (runs the script), `build` (web build then `go build -o build/feeder ./cmd/feeder`), `run` (`build` then runs it; needs `FEEDER_ADMIN_EMAIL`).
- `cmd/feeder/main.go`: Load config (exit 2 with the error on stderr when it fails) -> `db.Open` -> `db.MigrateEmbedded` -> `app.New(..., web.FS())` -> `http.Server` with graceful shutdown on SIGINT/SIGTERM.
- Dockerfile: stage 1 `node` + pnpm builds `web/dist`; stage 2 `golang:1.26.11` copies dist, `CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build`; stage 3 small runtime (distroless/static or alpine), non-root user, `VOLUME /data`, `ENV FEEDER_DATA_DIR=/data`, `EXPOSE 8080`; `FEEDER_DEV_LOGIN` unset.

## Frontend interfaces (`web/src`)

### `lib/`
- `http.ts`: `class ApiError extends Error { status: number; code: string }` (`code` from `{error:{code}}`, else `http_error`; status 0 / code `network` when fetch rejects). `createHttpClient({ fetch?, baseUrl?, onUnauthenticated? })` returns `{ get<T>(path), post<T>(path, body?), put, patch, delete }`; JSON in/out (`Content-Type: application/json` only when a body is sent), `credentials: 'same-origin'`, 204 -> `undefined`, a 401 calls `onUnauthenticated` then throws. `export const http` = default instance.
- `sse.ts`: `connectEvents({ url?='/api/events', eventSourceFactory? }) -> { subscribe(topic, handler): () => void; onReconnect(cb): () => void; close() }`. One `EventSource`; handlers get parsed JSON (unparsable data is ignored); `onReconnect` fires when the stream re-opens after an error (consumers invalidate queries).
- `format.ts`: `formatTimer(totalSeconds): string` (`m:ss`, `h:mm:ss` from 1 h, negative -> `-m:ss`, fractions floored toward zero), `initials(name): string` (max 2 letters, upper-case, `?` for empty).
- `motion.ts`: `prefersReducedMotion(win?)`; `motionDuration(ms, win?)` -> `0` when reduced, else `min(ms, 250)`.

### `theme/`
```ts
type Hex = string                                   // '#rrggbb' lower-case; '#rgb' accepted on input
type Scheme = 'light' | 'dark'
interface ThemeInput { accent: Hex; secondary?: Hex }
type ColorToken = 'primary'|'onPrimary'|'primaryContainer'|'onPrimaryContainer'|'secondary'|'onSecondary'|'secondaryContainer'|'onSecondaryContainer'
  |'background'|'onBackground'|'surface'|'surfaceContainerLow'|'surfaceContainer'|'surfaceContainerHigh'|'onSurface'|'onSurfaceVariant'|'outline'
interface Palette { scheme: Scheme; colors: Record<ColorToken, Hex> }
normalizeHex(h): Hex                                // throws Error(/hex/i) on invalid input
generatePalette(input: ThemeInput, scheme: Scheme): Palette
contrastRatio(a: Hex, b: Hex): number               // WCAG 2.x
meetsAA(fg, bg, opts?: { large?: boolean }): boolean   // 4.5, or 3 when large
ensureContrast(fg: Hex, bg: Hex, min = 4.5): Hex    // fg unchanged if it passes; otherwise lightness-shifted keeping hue
cssVarName(token: ColorToken): string               // 'onPrimaryContainer' -> '--color-on-primary-container'
toCssVars(p: Palette): Record<string, string>
applyTheme(root: HTMLElement, input: ThemeInput, scheme: Scheme): void
STATUS_COLORS: Record<'spoil'|'leftover', Record<Scheme, { bg: Hex; fg: Hex }>>   // fixed, never derived from the accent, AA-passing
<ThemeProvider accent secondary? scheme: 'light'|'dark'|'system'>   // applies to document.documentElement
```
Surfaces are strongly tinted: `surface*`/`background` take the accent hue with visible chroma (max-min RGB channel >= 8 in light; dark surfaces stay darker than light ones).

### `ui/` (shared Bento primitives; strings in `ui/strings.ts`)
| Component | Props | Notes |
|---|---|---|
| `Tile` | `size?: 'sm'\|'md'\|'lg'\|'wide'\|'full'` (def `md`), `tone?: 'neutral'\|'accent'\|'spoil'\|'leftover'` (def `neutral`), `onClick?`, `as?: 'div'\|'section'\|'article'`, `className?`, `children`, `aria-label?` | `data-size`, `data-tone`; renders a `<button>` when `onClick` is given |
| `BentoGrid` | `columns?: 2\|3\|4` (def 2), `label?`, `children` | `data-columns`; role `group` when labelled |
| `Chip` | `tone?`, `icon?`, `selected?`, `onClick?`, `children` | pill; `<button>` with `aria-pressed` when `onClick`; `data-tone` |
| `WhyChip` | `reason: string`, `onClick?` | a `Chip` with `data-kind="why"`, text = reason |
| `ProgressTile` | `label`, `value`, `max`, `valueLabel?` | `role="progressbar"`, `aria-valuenow` clamped to 0..max, shows `valueLabel` or `value / max` |
| `TimerTile` | `label`, `seconds`, `running?`, `onClick?` | `role="timer"`, text via `formatTimer`, tabular numerals; `data-state="running\|paused\|expired"` (expired when seconds <= 0) |
| `BottomSheet` | `open`, `onClose`, `title`, `children` | `role="dialog"` `aria-modal`, labelled by the title; Escape / backdrop click / "Close" button call `onClose`; focus moves in; nothing rendered when closed |
| `ToastProvider` / `useToast()` | `show(message, { tone?, actionLabel?, onAction?, durationMs?=4000 })` | `role="status"` live region; auto-dismiss; "Dismiss" button |
| `Button` | `variant?: 'primary'\|'tonal'\|'ghost'`, `size?: 'md'\|'lg'`, `loading?`, `icon?`, + button attrs | `type="button"` default; `loading` => disabled + `aria-busy` |
| `Stepper` | `value`, `onChange`, `label`, `min?=0`, `max?`, `step?=1`, `unit?` | buttons named `Decrease <label>` / `Increase <label>`; clamps; disables at bounds; value is `role="status"`-free plain text, tabular |
| `EmptyState` | `title`, `description?`, `illustration?`, `action?` | |
| `Avatar` | `name`, `imageUrl?`, `size?: 'sm'\|'md'\|'lg'` | image with alt=name, else `initials(name)`; `aria-label=name` |

### `app/`
- `nav.ts`: `PRIMARY_NAV` = Today `/`, Plan `/plan`, Scan `/scan` (raised), Shop `/shop`, Recipes `/recipes`; `MENU_NAV` = Stock `/stock`, Settings `/settings`. `interface NavItem { id; label; path; order?: number; placement: 'menu' }`.
- `features.ts`: `interface FeatureModule { routes: RouteObject[]; navItems?: NavItem[] }`. `collectFeatures(modules: Record<string, FeatureModule>) -> { routes, navItems }` — modules sorted by key; throws `Error(/duplicate/i)` when two features declare the same route path; menu items sorted by `order` then label. `buildRoutes(modules)` -> shell child routes: feature routes plus a `ComingSoon` placeholder for every core path no feature provides. `loadFeatures()` = `collectFeatures(import.meta.glob('../features/*/index.ts', { eager: true }))`.
- `AppShell({ user: { displayName; imageUrl? }, onSignOut, navItems? })` renders `<Outlet/>`. Landmarks: `nav` "Bottom bar" (phone; Scan link raised, `data-raised="true"`) and `nav` "Side rail" (desktop), both listing Today, Plan, Scan, Shop, Recipes in that order (CSS shows one of them); active link has `aria-current="page"`. Avatar button "Your menu" opens `role="menu"` with Stock, Settings, feature menu items, then "Sign out" (calls `onSignOut`).
- `useMe()`: react-query `GET /api/me`; resolves to the user, or `null` on 401. `AppProviders`: QueryClient + Theme + Toast.
- `strings.ts`: all shell copy.

### Feature contract (`web/src/features/<feature>/index.ts`)
`export const routes: RouteObject[]` and optional `export const navItems: NavItem[]`; auto-discovered. Do not edit shell files to add a feature.

### File layout (frontend tests import these paths)
`lib/{http,sse,format,motion}.ts`; `theme/{contrast,palette,apply}.ts` + `theme/ThemeProvider.tsx` (`contrast.ts`: `normalizeHex`, `contrastRatio`, `meetsAA`, `ensureContrast`; `palette.ts`: `generatePalette`, `cssVarName`, `toCssVars`, `STATUS_COLORS`, types; `apply.ts`: `applyTheme`; the provider also sets `data-scheme` on `<html>`); `ui/<Component>.tsx` one file per primitive, plus `ui/index.ts` barrel and `ui/strings.ts` ("Close", "Dismiss", "Decrease <label>", "Increase <label>"); the BottomSheet backdrop has `data-testid="bottom-sheet-backdrop"`; `app/{AppShell,features,nav,useMe,providers,strings}.ts(x)`, `app/ComingSoon.tsx` (heading = destination label, text "Coming soon"). Shell nav labels: Today, Plan, Scan, Shop, Recipes, Stock, Settings; avatar button "Your menu"; "Sign out".
