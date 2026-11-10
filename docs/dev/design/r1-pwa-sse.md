# R1 pwa-sse (round 2, QA B0 + B1 + shutdown)

## B0 service worker never installs
Cause: `manifest.webmanifest` is in the precache twice (the `injectManifest.globPatterns` glob plus the PWA plugin's own entry), so `Cache.addAll` throws `InvalidStateError`.
- `web/vite.config.ts`: `webmanifest` removed from `globPatterns` (already applied).
- `web/src/sw/cache.ts`: `uniquePrecacheUrls(manifestUrls, scope)` dedupes (resolved against scope, first wins, order kept); `sw.ts` `precache()` must use it (belt and braces).
- `scripts/test/precache_test.sh` (run by check.sh's shell-test step): builds into a temp dir and fails on any duplicate URL in the built `sw.js`. Verified red with the old glob.

## B1 one shared SSE connection
Decision: keep the public API `connectEvents(opts?) -> EventsConnection` (`subscribe`, `onReconnect`, `close`) but make each call return a lightweight **handle** on ONE module-level connection. First handle opens the `EventSource`; `close()` on a handle drops that handle's subscriptions and reconnect callbacks and releases its reference (idempotent); the last release closes the `EventSource`. All 10 hooks already call `connectEvents()` / `close()` in their effect cleanup, so **no caller migration is needed** (the hooks and their mocks stay untouched, avoiding conflicts with other teams).
- Topic fan-out: the shared source gets one DOM listener per topic while it has subscribers; JSON parsed once per event; a throwing handler does not stop the others.
- Reconnect: `error` then `open` calls every live handle's `onReconnect` callbacks.
- Auth failure / browser gives up (`readyState === 2` after `error`; a 401 does this): close the dead source, retry with exponential back-off (start 1 s, cap 30 s, reset after a successful open), re-attach all topic listeners to the new source, and fire reconnect callbacks on open. No retry once the last handle closed.
- `EventSourceLike` gains optional `readyState`. `resetSharedEvents()` is the test hook. The `eventSourceFactory`/`url` options of the first handle that opens the connection are used.

## Server shutdown
- `events.Bus.Close()` ends all streams (their handlers return, channel closed), is idempotent, and later `Subscribe` calls return a closed channel; `cancel` after Close must not panic.
- `app.App.BindServer(srv)` registers `Bus.Close` via `srv.RegisterOnShutdown`; `cmd/feeder/main.go` calls it before `ListenAndServe`. `App.Close` also closes the bus.

## Tests (red)
vitest `lib/sse.test.ts`, `sw/cache.test.ts`; Go `internal/events/bus_test.go` (TestClose*), `internal/app/shutdown_test.go`; `scripts/test/precache_test.sh` (green already, guards the config fix).
