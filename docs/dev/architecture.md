# Feeder v1: architecture contract (from the Project Manager)

Every team follows this. The foundation team (T0) commits it as `docs/dev/architecture.md` and keeps it accurate; later teams read it from there. Domain words come from GLOSSARY.md, never the `_Avoid_` words (in code identifiers, UI copy, test names, table names).

## Stack
- Go 1.26.11 (godog requires 1.26), module `github.com/fabbarix/feeder-ng`. Stdlib `net/http` (1.22+ method/path patterns), no web framework.
- SQLite via `modernc.org/sqlite` (pure Go, no cgo). WAL mode, foreign keys ON.
- BDD: `github.com/cucumber/godog`, run in-process from `go test`.
- Frontend in `web/`: Vite + React 19 + TypeScript (strict) + react-router + @tanstack/react-query; vitest + @testing-library/react + jsdom. pnpm. Font Figtree, self-hosted (`@fontsource/figtree`) so it works offline.
- One binary `cmd/feeder`, SPA embedded from `web/dist` (`web/embed.go`, `//go:embed all:dist`; a committed placeholder keeps `go build` working before the SPA is built; when `dist/index.html` is missing the server says "frontend not built").

## Config (env)
- `FEEDER_ADMIN_EMAIL` mandatory: the process exits non-zero with a clear message without it; it seeds the allowlist with the first Admin.
- `FEEDER_DATA_DIR` (default `/data`): `feeder.db`, `images/`, `backups/`.
- `FEEDER_ADDR` (default `:8080`), `FEEDER_BASE_URL` (public https URL, for OAuth redirect), `FEEDER_GOOGLE_CLIENT_ID`, `FEEDER_GOOGLE_CLIENT_SECRET`.
- `FEEDER_DEV_LOGIN=1` enables `POST /api/dev/login {email}` for local development only (never in the Docker image default); it logs in an allowlisted email without Google.

## Backend layout and rules
```
cmd/feeder/main.go                 config, open DB, migrate, build app, serve
internal/modules/<feature>.go      one file per feature: blank-import that feature's httpapi package (imported by cmd/feeder and internal/testkit)
internal/httpx/                    JSON helpers + APIError (leaf package; usable from app and auth)
internal/app/                      Module registry, router assembly, middleware (auth, JSON, errors)
internal/config/  internal/db/ (open + migration runner)  internal/clock/ (injectable Clock)
internal/events/                   in-process pub/sub + SSE endpoint GET /api/events
internal/auth/                     sessions, current user, RequireUser / RequireAdmin middleware
internal/<domain>/                 PURE domain logic: no net/http, no database/sql imports. Unit-tested directly.
internal/<domain>/store/           SQL repository for that domain
internal/<domain>/httpapi/         thin handlers: parse -> call domain/store -> respond. Registers itself via app.Register in init().
internal/db/migrations/NNNN_name.sql  embedded, applied in filename order, recorded in schema_migrations
internal/testkit/                  boots the whole app in-process (temp data dir, httptest server, fixed clock) and logs in a seeded User/Admin without Google
bdd/features/<feature>/*.feature   Gherkin
bdd/steps_<feature>_test.go        step defs for that feature, registered via init() into the shared registry (bdd/registry_test.go, owned by T0)
```
- Handlers are thin. Domain packages hold all rules and are unit-tested. Store packages get integration tests against a temp SQLite.
- **Migration number ranges** (so teams never collide): T0 0001-0099, auth/household 0100-0199, ingredients 0200-0299, recipes 0300-0399, products/shops 0400-0499, stock 0500-0599, planning 0600-0699, import/export 0700-0799, shopping/scan 0800-0899, cook/board 0900-0999, notifications/ops 1000-1099.
- Quantities: Base Units are `g`, `ml`, `piece`. Store quantities as REAL in Base Units. Money as integer cents. Dates as `YYYY-MM-DD` TEXT in household time; instants as RFC 3339 UTC TEXT.
- IDs: INTEGER PRIMARY KEY for server rows; client-generated UUIDs only where the spec requires idempotency (offline scans).
- Time: never call `time.Now()` in domain/store code; take a `clock.Clock` or explicit times.
- CSRF: `httpx.CSRFGuard` (wired in `app.New`) answers state-changing `/api` requests (POST, PUT, PATCH, DELETE) with 415 unless a body is `application/json`, and 403 `cross_origin` when an `Origin` header does not match `FEEDER_BASE_URL` (or the request Host when unset); tests must send JSON.
- JSON API under `/api/...`, camelCase fields. Errors: `{"error": {"code": "...", "message": "..."}}`.
- Live updates: publish on `internal/events` with a topic (`plan`, `shopping`, `stock`, `timers`, ...); the SPA subscribes via one SSE connection.

## Frontend layout and rules
```
web/src/app/            shell: router, AppShell (bottom bar Today · Plan · Pantry · [Scan] · Shop · Recipes on phone, side rail on desktop; avatar menu -> Kitchen board, Settings), providers
web/src/ui/             shared Bento primitives (Tile, BentoGrid, Chip, WhyChip, ProgressTile, TimerTile, BottomSheet, Toast, Button, Stepper(±), EmptyState, Avatar, ViewfinderStrip slot...). Never copy markup between screens.
web/src/theme/          accent -> tonal light/dark palette (Material-You style), WCAG AA contrast check, fixed status colours (spoil, leftover). Pure TS, unit-tested.
web/src/lib/            plain TS (no React): http client, SSE client, shared pure helpers
web/src/features/<feature>/
    index.ts            exports { routes, navItems? } ; auto-discovered via import.meta.glob -> no shared route file to edit
    api.ts              typed API calls for this feature (uses lib/http)
    hooks/              React hooks (state, effects, react-query) that call into lib/ and api.ts
    lib/                pure domain functions (no React), unit-tested
    components/         render + wire events only; no business logic, no fetch, no domain maths
    strings.ts          English UI strings for the feature (externalised)
```
- Components are small; split at more than one responsibility. Data and callbacks come from hooks/props.
- Bento look: tiles sized by urgency, Figtree, strong accent tint on surfaces, corners 20-32 px, pill chips, motion <= 250 ms, `prefers-reduced-motion` respected, tabular numerals for quantities/timers.

## Tests and check
- **BDD step text must be feature-specific.** godog does not detect duplicate step text across files (a clash silently runs one definition for both features). Reuse only the generic steps in `bdd/steps_common_test.go`; phrase new steps in your feature's own words, and register them under a unique `RegisterSteps` name.
- Designer writes unit tests (Go `_test.go` next to domain code; vitest `*.test.ts(x)` next to TS) and Gherkin scenarios FIRST; Developer makes them pass.
- `scripts/check.sh` (also `make check`) runs, in the current worktree only: pnpm install (frozen lockfile), typecheck, vitest, vite build, `go vet ./...`, `go test ./...` (includes BDD). It also runs every `scripts/test/*_test.sh` (shell tests for scripts/infra; a team may add one). Output goes to `<worktree>/build/check.log` (`build/` is gitignored). Exit code non-zero on any failure.
- No synthetic load, no long-running servers in tests (use httptest). If a dev server is needed: `setsid nohup ... > build/server.log 2>&1 &` on a port unique to the worktree.

## Shared files (serialised by the PM)
`go.mod`, `go.sum`, `web/package.json`, `web/pnpm-lock.yaml`, `internal/app/*`, `internal/httpx/*`, `web/src/app/*`, `web/src/ui/*`, `web/src/theme/*`, `bdd/registry_test.go`, service worker. T0 pre-installs the dependencies later teams are expected to need. A team that must change a shared file says so in its report; lockfile conflicts at merge are resolved by the PM by regenerating.
