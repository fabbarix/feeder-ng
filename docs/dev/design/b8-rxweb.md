# b8-rxweb: the background receipt read, the receipt page spacing, and glossary wording

Team rxweb, Feeder 1.0.0-beta.8. Design doc refined: [receipt-reading.md](../../design/receipt-reading.md) 3.3 and 8.4. ADR 0018 only changes wording.

## 1. Background receipt read

### Decision

Leaving the receipt screen no longer cancels the read. The read keeps going; the Scanned list's "Read the receipt" row says when the Receipt review is ready, and a toast does when the User is elsewhere in the app.

### The server needs no change

`internal/receipt/service.Start` runs the job on `context.Background()` with its own 120 s cap, not on the request's context. A finished job is kept 10 minutes (`jobTTL`, on the injected clock) and `GET /api/scan/receipt/reads/{id}` returns it any number of times; after that it is a 404 (`not_found`), and an apply of it is `410 receipt_read_gone`. `DELETE` is the only thing that stops a running read. BDD (`bdd/features/receipt/receipt_background.feature`, tag `@receipt-background`) pins this and is already green. **No Go change is needed from rxgo.**

### Why the client changes

`useReceiptRead` owns the timers and sends `DELETE ... keepalive` on unmount. The run therefore dies with the screen. The run moves into a module-level store that outlives navigation; the hook becomes a binding to it.

### State: `lib/backgroundRead.ts` (plain TypeScript, no React)

One read at a time (the server allows one running read per User), carrying its Shop:

```
BackgroundRead =
  | { status: 'reading'; shopId; startedAt; readId?; connectionLost }    readId once the POST is answered
  | { status: 'ready';   shopId; readId; changes }                       changes = proposals.length; the read itself is in lib/readStore (10 min)
  | { status: 'failed';  shopId; error: ReceiptErrorInput }
```

API: `startBackgroundRead(session, photos)`, `cancelBackgroundRead()`, `dismissBackgroundRead()`, `getBackgroundRead()`, `subscribeBackgroundRead(l)`, `onBackgroundReadFinished(l)` (ready or failed, once per read, never after a cancel), `resumeBackgroundRead(now?)`, `resetBackgroundRead()`, `BACKGROUND_READ_KEY = 'feeder.receipt.read'`.

Behaviour (ported from the old hook, all timing constants stay in `lib/readPolling`):
- `start`: state `reading` (no readId) while the POST is on its way; on 202 sets `readId`, polls every `POLL_INTERVAL_MS`, gives up `POLL_TIMEOUT_MS` after `startedAt` with `failed{timeout}` and a `DELETE`. A refused start is `failed` with `failureOf(err)`. A second start while `reading` does nothing.
- Poll result: `running` goes on; `done` calls `rememberRead({readId, shopId, clientUuids, read})`, state `ready{changes}`, announces; `failed` job gives `failed{code, retryAfterSeconds?}`; status 0 sets `connectionLost` and goes on; 404 gives `failed{receipt_read_gone}`; other errors `failureOf`.
- `cancel`: stops timers, `DELETE` when a readId exists, and when the POST is still in flight sends the `DELETE` once it answers; clears state; answers that arrive afterwards are ignored. Announces nothing.
- `dismiss`: clears `ready` (also `forgetRead()`, no `DELETE`: the server keeps it its 10 minutes) or `failed`; does nothing while `reading`.
- A `ready` state expires `READ_KEPT_MS` after it was reached: state cleared, `forgetRead()`.
- **Persistence** (survives a reload only, `sessionStorage`, every call in try/catch, works without it): once the readId is known write `{shopId, readId, clientUuids, startedAt}` (add `finishedAt` when ready). Never a photo, no data URL. Remove on cancel, dismiss, expiry, failure. `resumeBackgroundRead(now)`: no entry or unreadable: nothing. Entry older than `POLL_TIMEOUT_MS` (running) or `READ_KEPT_MS` after `finishedAt`: dropped without asking. Otherwise state `reading`, one poll at once, then as above; a 404 drops the entry silently (no `failed` state: nothing the User did is lost that they could still use). A `done` poll after a reload re-fills `lib/readStore`, which is how the review opens after a reload.

### Hooks and components

- `hooks/useBackgroundRead(shopId?)`: `useSyncExternalStore` over the store, filtered to the Shop (a Scanned list belongs to its Shop; a read of another Shop is invisible to it).
- `hooks/useReceiptRead(session)`: same public shape as today (`phase, busy, error, elapsedSeconds, connectionLost, readId, start, cancel, reset`), derived from the store for `session.shopId`: `reading` without readId is `starting`, with readId `running`, `ready` is `done`, `failed` is `failed`, else `idle`. `elapsedSeconds` ticks from `startedAt` while reading, so coming back to a running read shows the right time. **The unmount `DELETE` is removed.** On unmount, a failure the screen was showing is dismissed (the User saw it); a failure that arrived while the screen was away stays for the row. `reset()` dismisses a failure.
- `ReadReceiptFooter` (same props) reads `useBackgroundRead(shopId)` and renders the three rows below before the offline, waiting and assistant checks; no scans still means nothing. The rows are `ListRow`s built from `lib/backgroundCopy.rowView`.
- `components/ReceiptReadWatcher` (renders `null`; `useLocation`, `useNavigate`, `useToast`, and the remembered User of `app/meCache` for the Admin flag, read when the read ends): on mount `resumeBackgroundRead()`; subscribes to `onBackgroundReadFinished` and shows `finishedToast(state, pathname, {isAdmin})`. Its action navigates to the plan's `to`; for `failed` it first dismisses the failure. Exported from `features/receipt/index.ts`.
- `useReceiptReview`: wherever it calls `forgetRead()` (apply success, `readAgain`) it calls `dismissBackgroundRead()`, which forgets the kept read itself. A `410 receipt_read_gone` from the apply also dismisses (the read is stale). Other refusals keep the read and the row.
- `ReceiptPhotosScreen`: `ReadProgress` gets the extra line "You can leave. Feeder keeps reading." Opening it while a read runs (from the row) shows the progress with no photos and the Cancel button. Back while reading just leaves (as now; the hook no longer cancels). Success still navigates to the review.

### The row (Scanned list, `ReadReceiptFooter`)

| State | Title | Meta | Press |
|---|---|---|---|
| reading | Reading the receipt… | You can leave. Feeder keeps reading. (lost connection: Lost the connection. The read continues; come back to see it.) | opens `/scan/receipt` (the progress); the row is a polite `role="status"` |
| ready | Receipt read: review 9 changes (1 change; 0: Receipt read: nothing to change) | Nothing changes until you apply. | opens `/scan/receipt/review`; a trailing **Dismiss** IconButton forgets the read (reviewer: otherwise a read the User does not want, or one with nothing to change, holds the row and the photos 10 minutes) |
| failed | The receipt could not be read | the failure's words (`describeReceiptError`) | dismisses and opens `/scan/receipt`; a trailing **Dismiss** IconButton only dismisses |

The session is published before navigating (`publishReceiptSession`), as for the plain row. Domain words only: Receipt review, Scanned list, Read; no word under `_Avoid_`.

### Toast copy (`lib/backgroundCopy.finishedToast`)

Only when the path is not `/scan` and not under `/scan/receipt`:
- ready: "Receipt read: review 9 changes", success, action **Review** to `/scan/receipt/review`.
- failed: the failure's words, error status (stays until dismissed), action **Read it again** to `/scan/receipt`.

### Stale reads

| Event | Result |
|---|---|
| 10 minutes after ready | store clears, `forgetRead()`; row is the plain row |
| apply succeeds | `dismissBackgroundRead()` |
| Read it again (review) | `dismissBackgroundRead()` |
| apply 410 `receipt_read_gone` | read forgotten, row plain, review says "This read is no longer kept (10 minutes)." |
| apply 500 `receipt_apply_failed` (put back, the Scanned list re-keyed) | read forgotten, row plain (reviewer: the old read's uuids are gone) |
| apply 409 `receipt_session_changed` | read and row stay (as today: the review offers Read it again) |
| poll 404 | `failed{receipt_read_gone}`; after a reload, dropped silently |

### Strings (`strings.ts`, additions)

`readingRowMeta: 'You can leave. Feeder keeps reading.'`, `failedRowTitle: 'The receipt could not be read'`, `reviewAction: 'Review'`, `readyTitle: (n) => ...` ("Receipt read: review 1 change" / "... 2 changes"), `nothingToChange: 'Receipt read: nothing to change'`; existing `reading`, `nothingChanges`, `readAgain`, `dismiss`, `lostConnection` are reused. `lib/backgroundCopy.readyTitle(n)` picks the 0 case.

### Files the developer may touch

- new: `web/src/features/receipt/lib/backgroundRead.ts`, `lib/backgroundCopy.ts`, `hooks/useBackgroundRead.ts`, `components/ReceiptReadWatcher.tsx`
- change: `hooks/useReceiptRead.ts`, `hooks/useReceiptReview.ts`, `components/ReadReceiptFooter.tsx`, `components/ReadProgress.tsx`, `screens/ReceiptPhotosScreen.tsx`, `screens/ReceiptReviewScreen.tsx`, `strings.ts`, `index.ts`, `receipt.css`
- **outside the feature**: `<ReceiptReadWatcher />` is mounted once in `web/src/app/AppRoot.tsx`, beside `<AppShell>` for a signed-in User (inside the router and `AppProviders`), and sign-out calls `resetBackgroundRead()` there next to `forgetStoredPhotos()`. It is deliberately not inside the Scan screen, which is not mounted while the User is elsewhere. (Reviewer: first built in `AppShell.tsx`, twice, one per frame, with a new `useOptionalToast` because the shell tests have no ToastProvider; the repo bans `useOptional*` (`lib/baseRecipes/round3.test.tsx`), AppShell is team shop's file, and AppRoot mounts it once and only while signed in. `AppRoot.test.tsx` now wraps a ToastProvider.)
- not to touch: Go files; `web/src/features/scan/**` (the row needs no change there: `useScanReceipt` keeps passing the same props).

## 2. Existing tests that change (and why)

`hooks/useReceiptRead.test.tsx`: `resetBackgroundRead()` in `beforeEach/afterEach` (the store is module state); the three unmount tests are replaced: leaving used to `DELETE` and stop polling, it now does neither (design 3.3). New tests there: coming back to a running or finished read, another Shop's read, failure handling on unmount. `ReceiptPhotosScreen.test.tsx` mocks the hook and needs no change; its "Back while reading" test already says the hook decides.

## 3. Receipt page spacing

Problems: (a) `Page` has no gap between `.page__header` and `.page__body`; on the receipt pages the header sits directly on "PHOTOS (n)". (b) The sticky bar is the last item of `.page__body`, so a short page puts it right after the content instead of at the foot of the screen.

What other pages do (system.md 8): sections are `--section-gap` apart (the body grid); the header-to-body gap is not a Page rule today (other screens sit under the shell's top bar or breadcrumbs). The receipt pages are chromeless (no bars), which is why it shows here. A bar that is last in flow is also what other pages do, but they are normally taller than the viewport; the receipt pages are the short ones. Fix in `receipt.css` only, tokens only, scoped by the marker `.receipt-page-header` that both screens put on their header (`header={<div className="receipt-page-header"><PageHeader/></div>}`, a small `ReceiptPageHeader` component is fine):

```css
.receipt-page-header { margin-block-end: var(--section-gap); }
.page:has(.receipt-page-header) { display: flex; flex-direction: column; min-block-size: 100dvh; box-sizing: border-box; }
.page:has(.receipt-page-header) > .page__body { display: flex; flex-direction: column; flex: 1 1 auto; gap: var(--section-gap); }
.page:has(.receipt-page-header) .sticky-action-bar { margin-block-start: auto; }
```

The chromeless shell already pads `.page` by `--page-gutter` top and bottom, so the bar floats a gutter above the bottom, as `StickyActionBar` intends. The reviewer checks 390 and 1280 px with one photo, with four photos, and on the review with few proposals; and that a tall review still scrolls with the bar sticky. If `.page__body`'s `display` change affects the review's sections, switch back to the grid and use `grid-template-rows: auto` + `align-content: space-between` instead; the tests pin the observable result (`receipt.css.test.ts`) only for the flex form, so change the test with the reason in the commit.

## 4. Glossary wording

"Any Member" is a GLOSSARY `_Avoid_` of **User** (a Member eats from the plan and need not sign in; a User signs in and sends the photos). Replaced by **User** in ADR 0018 (decision 3, the answers list, and "a User photographs the Receipt" in its intro) and in receipt-reading.md (Q2 row; the Settings sentence "Users can also send receipt photos…"). The rest of both docs was checked against every `_Avoid_` list; no other avoided word is used (matches of "weights", "never", "product" etc. are ordinary words, not listed terms in these senses). Also noticed, not in my files: `bdd/features/receipt/receipt_read.feature` says "A Member reads a receipt" and "a Member photographs the Receipt" (rxgo's area).

## 5. Tests (red until built)

| File | Level | Covers |
|---|---|---|
| `lib/backgroundRead.test.ts` | library | the store: start, poll, ready, failed, timeout, 404, cancel, dismiss, stale, announce, sessionStorage resume |
| `lib/backgroundCopy.test.ts` | library | row views, ready title counts, toast plans and where they are suppressed |
| `hooks/useBackgroundRead.test.tsx` | hook | store as React state, filtered by Shop |
| `hooks/useReceiptRead.test.tsx` (changed) | hook | the binding; leaving does not cancel |
| `hooks/useReceiptReview.background.test.tsx` | hook | the review clears the row on apply, Read it again, 410; keeps it on 409 |
| `components/ReadReceiptFooter.background.test.tsx` | component | the three rows, navigation, precedence, other Shop, no scans |
| `components/ReceiptReadWatcher.test.tsx` | component | the toast, its actions, no toast on Scan routes, resume after reload |
| `components/BackgroundRow.a11y.test.tsx` | a11y | roles, names, live region, real buttons |
| `screens/ReceiptPages.layout.test.tsx` | component | header marker on both pages, "You can leave" line, progress from the row |
| `receipt.css.test.ts` | CSS source | the spacing and foot-of-screen rules, tokens only |
| `strings.test.ts` (extended) | library | new copy, no avoided words |
| `bdd/features/receipt/receipt_background.feature` (+ `steps_receipt_background_test.go`) | BDD | the server contract the background read relies on (already green); the client journey is covered by the vitest suites above, as the repo has no browser-level Gherkin runner |

## 6. Green commands

```
cd web && pnpm vitest run src/features/receipt
cd web && pnpm tsc --noEmit -p .
GODOG_TAGS=@receipt-background go test ./bdd/ -count=1
scripts/check-ui.sh
```
