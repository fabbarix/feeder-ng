# A1 Access Requests: sign-in approval

Scope: functional-spec §2 (access) and §12 (notifications), [ADR 0005](../../adr/0005-sign-in-needs-approval.md). Request: "people can login only after their e-mail is approved by another user or if their address was added to the family, so not everyone can just login with a Google account." Tests are written first (red); the Developer implements until `scripts/check.sh` passes. Domain term: **Access Request** (GLOSSARY has no better word; `_Avoid_`: invite, signup, join request).

## 1. Current state against the request

| Wanted | Today | Gap |
|---|---|---|
| Pre-added address signs in at once | **Works.** `internal/auth/httpapi/google.go` looks the verified email up in `users` (`UserByEmail`) and starts a session. The allowlist (Settings, Admin) and `FEEDER_ADMIN_EMAIL` both add rows to `users`. Covered by `google_signin.feature` and `google_test.go`. | none |
| Member-linked email signs in | **Does not exist.** `members` has no email column (`0100_household.sql`); a Member is linked to an existing User by id (`PUT /api/members/{id}/user`, `members.user_id`). A Member only signs in because an Admin first added the same person to the allowlist and then linked them. Nothing reads an address from a Member. | New: an optional **Member email**. A verified Google sign-in whose address equals the email of a not-yet-linked Member creates the User and links it. |
| Unknown Google accounts must not get in | **Works, but dead-ends.** Unknown or unverified email -> `/not-invited` ("Ask an Admin to add your email"), no session, no row. | Replace the dead end for *verified* unknown accounts with an Access Request and a waiting page. Unverified stays on `/not-invited`. |
| Approval by any User | Only an **Admin** can add to the allowlist (`r.Admin("POST /api/allowlist")`). | New `r.User` routes; approval adds a non-Admin User. |
| Pending list, badge, push | None. Web Push has six per-device types (`notify.AllTypes`, a CHECK constraint on `push_subscription_types.type`); the shell has `useShellStatus` (scan count only). | New type `accessRequest`, new Fact, new shell count. |
| Flood protection, audit | No unauthenticated write path exists today, so none. | New: limits, cap, expiry, audit table. |

Already good: the callback requires `email_verified`; PKCE and state are checked; the CSRF guard (`httpx.CSRFGuard`, JSON + same-Origin on every state-changing `/api/` request) already covers POSTs; `RequireUser` guards every household route, so a visitor without a session cannot reach data.

## 2. Design

### 2.1 Sign-in decision (`access.Service.SignIn`)
The callback keeps its flow checks (state, PKCE, exchange). After `Exchange` it calls `SignIn(ctx, ip, identity)` and acts on the `Decision`:

| Order | Condition | Decision | Callback does |
|---|---|---|---|
| 1 | address is a User and `email_verified` | `SignedIn` | existing path: display-name tweak, session, redirect `/` |
| 2 | not verified, or not a valid address | `Unverified` | redirect `/not-invited`; nothing stored; a pending request is **not** refreshed |
| 3 | verified and a Member with that email has no User | `SignedIn` | `AddUser` (non-Admin, name = Google name) + `Members.LinkUser`; then as 1 |
| 4 | the IP made `PerIPPerHour` (10) submissions in the last hour | `Limited` | redirect `/waiting-for-approval?state=limited` |
| 5 | an unexpired request exists for the address | `Pending` | refresh name/picture/last seen and **rotate the waiting token**; no new row, no push, no event |
| 6 | the address was denied less than `DenyCooldown` (24 h) ago | `Limited` (`RetryAfter` = remainder) | `?state=limited` |
| 7 | the address already created `PerEmailPerWeek` (3) requests in 7 days | `Limited` | `?state=limited` |
| 8 | `MaxPending` (50) requests are pending | `QueueFull` | `/waiting-for-approval?state=full` |
| 9 | otherwise | `Pending` (new) | insert, `requested` event, `OnRequested` hooks, set cookie, redirect `/waiting-for-approval` |

Users (1) and Member emails (3) are never throttled: a full queue or a flooded IP cannot lock the family out. Expired rows are ignored by every read and cleared by `Purge` (daily scheduler job `access.purge` at 03:45, plus lazily when the same address signs in again).

No session is ever created for 2, 4 to 9. The waiting page is a signed-out page of the SPA; its only server data is `GET /api/access-request/status`.

### 2.2 Waiting-page token
On `Pending` the callback sets cookie `feeder_access` = a random 32-byte token (base64url); only its SHA-256 is stored (`access_requests.token_hash`). HttpOnly, SameSite=Lax, Secure when the base URL is https, `Path=/api/access-request` (so it is never sent to any other route), expires with the request. `GET /api/access-request/status` is public, always 200, `Cache-Control: no-store`, and returns only `{status:"pending", email, name, requestedAt}` (the visitor's own Google details) or `{status:"none"}` for no cookie, unknown token, answered or expired. After an approval the page cannot tell approved from denied (it says "Request answered" and offers Google sign-in); an approved person is then signed in, a denied one lands on the cool-down message. The page polls every 15 s and, on `none`, stops.

### 2.3 Approval
Any signed-in User (`r.User`). `POST /api/access-requests/{id}/approve`: `AddUser(email, cleaned Google name, isAdmin=false)`, delete the request, `approved` event with actor id and email, live event. If the address became a User meanwhile (`ErrEmailTaken`) the request is simply cleared (idempotent). `POST .../deny`: delete the request, `denied` event. Both 404 for unknown or expired ids; a second answer to the same request gets 404 (the UI shows "already answered"). Self-approval is impossible: a visitor has no session.

### 2.4 Notifications
New type `accessRequest` (spec §12 row "Access Request: when someone asks to sign in; deferred out of quiet hours"). It goes through the existing fact pipeline so quiet hours, Grace and once-only dedupe come for free: `Facts.AccessRequests []AccessRequestFact{ID, Name, Email, RequestedAt}` (pending requests, read by `notify/facts`), `Compute` turns each into a `Candidate{Key: "accessRequest:<id>@<requestedAt>", At: RequestedAt, Title: "New sign-in request", Body: "<name> (<email>) wants to join Feeder", URL: "/settings/access-requests"}`. Opt-in is per device like every type (off by default). A request answered before its push is due is no longer a fact, so it is not pushed. The text comes from Google, so the push body is plain text and length-capped (200 chars).

### 2.5 Live updates and the shell badge
The module publishes `access` `{"changed":"requests"}` on create, approve, deny and purge (`OnRequested` plus the handlers). The `access` feature exports `useShellStatus` returning `pendingAccessRequests` (polls `GET /api/access-requests` and refetches on the event). The shell shows a badge on the avatar button (`aria-label` "Your menu, 3 sign-in requests waiting") and a "Sign-in requests" item in the avatar menu while the count is above 0. Settings gets a row "Sign-in requests" in the Household group for every User, with the count as its meta.

### 2.6 Member email
`members.email` (nullable, case-insensitive unique). Admin sets it in the Member editor (`email` in `POST/PATCH /api/members`, normalised, optional, 409 `email_taken` if another Member has it). It is shown to Users in the Members list like the name. A sign-in matches only a Member that has **no User yet**; after linking, the User row is authoritative and the Member email is only a label.

## 3. Threat model

| Threat | Mitigation |
|---|---|
| Stranger with any Google account gets in | No session without a User row; approval is by a signed-in User; every `/api` data route stays `RequireUser`. Test: pending visitor gets 401 on household, allowlist and events routes. |
| Unverified or spoofed email | `email_verified` required for all paths (1, 3, 5, 9); unverified neither signs in, nor creates, nor refreshes a request. |
| Queue flood by script | Google sign-in is the only entry, so each submission needs a real Google round trip; still: 10 per IP per hour, 3 per address per week, 24 h cool-down after denial, 50 pending globally, one row per address (UNIQUE NOCASE), 14-day expiry, name <= 100 chars, picture <= 500 chars. |
| IP spoofing via `X-Forwarded-For` | `ClientIP` trusts the header only when `FEEDER_TRUST_PROXY` is set (default **true**, ADR 0004 requires a reverse proxy) and then only the **last** entry (appended by the operator's proxy). A direct-exposed container can be spoofed past the IP limit but not past the per-address, cool-down or global limits. |
| Approving the wrong person / CSRF | POST only; JSON/same-Origin guard applies (`cross_origin` 403, `unsupported_media_type` 415); SameSite=Lax session. A malicious site cannot approve. Deny asks for confirmation in the UI. |
| Stored XSS via Google name or photo | Name is control-char stripped and length-capped, rendered as React text; picture kept only if `https://*.googleusercontent.com` and <= 500 chars, else dropped (no arbitrary image fetch from other Users' browsers). Push body is plain text. |
| Information leak to a pending visitor | No session, so all routes 401; the waiting page shows only the visitor's own Google name/email from their own token; status for a missing token reveals nothing (not even whether the address is pending); `no-store`; the SPA shell is static. The same page text for every state avoids confirming that the household exists beyond the app's own name. |
| Token theft | Only a hash is stored; token rotates on each sign-in; cookie is path-scoped, HttpOnly; it only reveals the visitor's own Google data. It grants no access, so a stolen token is harmless. |
| Cool-down evasion by changing case / plus-addressing | Case folded. Plus-addressing (`a+1@gmail.com`) is a different verified Google identity string and is allowed; the per-IP and global caps bound it. Accepted. |
| Approval fatigue / denial of service on Users' attention | Global cap 50; push is deferred during quiet hours; per-IP limit. |
| Audit gaps | `access_events` records requested, approved, denied, expired with actor id and actor email (no foreign key: survives the actor's removal). Visible to every User at `GET /api/access-requests/history`. Removing a User later is not an Access Request event (existing allowlist behaviour). |
| An approved person is unwanted | Any User can approve, so any User can be removed by an Admin from the allowlist (sessions end at once, existing behaviour). Product question Q1 asks whether more is wanted. |

## 4. API

All JSON; errors use `{"error":{"code","message"}}`. Authentication in brackets.

| Route | Auth | Result |
|---|---|---|
| `GET /auth/google/callback` | public | as before, plus `/waiting-for-approval[?state=limited|full]` redirects and the `feeder_access` cookie |
| `GET /api/access-request/status` | public | `{status:"pending",email,name,requestedAt}` or `{status:"none"}` |
| `GET /api/access-requests` | User | `{requests:[{id,email,name,picture,requestedAt,expiresAt}], count}`, oldest first, unexpired only |
| `POST /api/access-requests/{id}/approve` | User | 200 `{id,email,displayName,isAdmin:false}`; 404 `not_found` |
| `POST /api/access-requests/{id}/deny` | User | 204; 404 `not_found` |
| `GET /api/access-requests/history` | User | `{events:[{kind,email,name,at,actorEmail}]}`, newest first, 50 |
| `POST/PATCH /api/members` | Admin | accept and return optional `email` (Member email) |
| `GET /api/notifications/config`, device routes | User | accept/list the type `accessRequest` |

Event topic `access`: `{"changed":"requests"}`.

## 5. Data model: migration `internal/db/migrations/1200_access_requests.sql`

**Split (phase 1 / phase 2).** Phase 1 ships `1200_access_requests.sql` WITHOUT the `members.email` column and its unique index (both tables use `AUTOINCREMENT`, like 1100). They move to `1210_member_email.sql`, applied with the household changes in phase 2 (statements below marked `-- phase 2`). The Go service already has the `Members` port; the app passes `nil` until then, so the Member-email sign-in is off.
```sql
-- A1: Access Requests, their audit trail, Member email, and the accessRequest push type.
CREATE TABLE access_requests (
    id           INTEGER PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name         TEXT NOT NULL,
    picture      TEXT NOT NULL DEFAULT '',
    token_hash   TEXT NOT NULL UNIQUE,
    requested_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL
);
CREATE INDEX access_requests_expires ON access_requests (expires_at);

CREATE TABLE access_events (
    id            INTEGER PRIMARY KEY,
    at            TEXT NOT NULL,
    kind          TEXT NOT NULL CHECK (kind IN ('requested', 'approved', 'denied', 'expired')),
    email         TEXT NOT NULL COLLATE NOCASE,
    name          TEXT NOT NULL DEFAULT '',
    actor_user_id INTEGER,                    -- deliberately no foreign key: the audit trail outlives the User
    actor_email   TEXT NOT NULL DEFAULT ''
);
CREATE INDEX access_events_email ON access_events (email, kind, at);

-- phase 2 (1210_member_email.sql):
ALTER TABLE members ADD COLUMN email TEXT COLLATE NOCASE;
CREATE UNIQUE INDEX members_email ON members (email) WHERE email IS NOT NULL;

-- Widen the CHECK on push_subscription_types (SQLite cannot alter it): rebuild the child table.
CREATE TABLE push_subscription_types_new (
    subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    type            TEXT    NOT NULL CHECK (type IN
        ('advanceStep', 'startCooking', 'confirmCooked', 'leftoverUseBy', 'stockSpoil', 'timerFinished', 'accessRequest')),
    PRIMARY KEY (subscription_id, type)
);
INSERT INTO push_subscription_types_new SELECT subscription_id, type FROM push_subscription_types;
DROP TABLE push_subscription_types;
ALTER TABLE push_subscription_types_new RENAME TO push_subscription_types;
```
Rows past retention (`access_events` older than 1 year) are pruned by the same `access.purge` job. Number 1200 is above R11c's 1150 (`bdd` and `db` tests that count migrations need no change; check `db_test.go` when adding).

## 6. Files

New (A1 owns all of them):
- `docs/adr/0005-sign-in-needs-approval.md`, this note.
- `internal/access/access.go` (Service, Limits, ports, `CleanName`, `CleanPicture`, `ClientIP`); skeleton exists, bodies return `ErrNotImplemented`.
- `internal/access/store/store.go` (SQLite `access.Store`); skeleton exists.
- `internal/access/httpapi/httpapi.go` (module "access": routes of §4, purge job, `access` events, cookie); only `doc.go` exists.
- `internal/access/adapters.go` or in `httpapi`: `Members` adapter over `household/store` (see wiring).
- `internal/modules/access.go`: `import _ ".../internal/access/httpapi"`.
- `internal/db/migrations/1200_access_requests.sql`.
- `web/src/features/access/`: `types.ts`, `api.ts`, `strings.ts`, `lib/{requests,waitingView,liveUpdates}.ts`, `hooks/{queryKeys,useAccessRequests,useAccessBadge,useWaitingStatus}.ts` (+ a `useAccessLiveUpdates` inside `useAccessRequests`), `components/{AccessRequestList,WaitingPage,AccessBadge}.tsx`, `screens/AccessRequestsPage.tsx`, `index.ts` (route `/settings/access-requests`, `useShellStatus`), `access.css`. Skeletons exist. Copy lives in `strings.ts`; components stay free of API calls and maths (CLAUDE.md): `daysLeft`, `badgeText`, relative time are in `lib`.

## 7. Wiring edits in shared files (PM to sequence)

| File | Edit | Conflicts with |
|---|---|---|
| `internal/app/registry.go` (`Deps`) and `internal/app/app.go` | add `Access *access.Service`, built from `accessstore.New(d)`, `authSvc`, a Members adapter, `Clock`, `DefaultLimits()` (`New` also reads `cfg.TrustProxy`) | none known (not `spa.go`) |
| `internal/config/config.go` | `TrustProxy bool` from `FEEDER_TRUST_PROXY` (default true) | none |
| `internal/auth/httpapi/google.go` | replace the `UserByEmail`/`/not-invited` block with `d.Access.SignIn` + the switch of §2.1; set/clear `feeder_access` | A1 only |
| `internal/notify/types.go`, `compute.go`, `notify/facts/facts.go`, `notify/httpapi` (type list), migration | `AccessRequest` type in `AllTypes` (after `timerFinished`), `Facts.AccessRequests`, `Compute` rule, facts query. **Existing notify tests that assert the exact type list/count must be updated.** | R11a (notifications UI); none in Go |
| `internal/household/{members.go,store/store.go,httpapi/members.go}` | Member `Email` field, validation, `Members` adapter methods `ByEmail`/`LinkUser` | **R11c owns `household/store` now: do last** |
| `web/src/features/signin/{lib/signedOutView.ts,components/SignedOut.tsx}` | `{view:'waiting', kind}` for `/waiting-for-approval`, render `access/components/WaitingPage`; signed-in visit to that path goes `/` (add to `routes`) | none |
| `web/src/app/AppRoot.tsx`, `AppShell.tsx`, `YourMenu.tsx`, `features.ts` | `ShellStatusInfo.pendingAccessRequests`; sum in AppRoot; pass `pendingAccessRequests` to AppShell/YourMenu; render `AccessBadge` and the "Sign-in requests" menu item | **R11a: `web/src/ui`, `nav.ts`** are untouched; `shell.css` badge style goes in `access.css` |
| `web/src/features/settings/{lib/settingsSections.ts,strings.ts}` | row "Sign-in requests" (Household group, all Users) | **R11a owns `settings/strings.ts` now: do last** (the page works without the row; the avatar menu already leads there) |
| `web/src/features/settings/components/AllowlistPanel.tsx`, `MemberEditor.tsx` | Member email field; allowlist panel hint "People can also ask to join" | R11a? (check) |
| `web/src/features/notifications/...NotificationSettingsScreen.tsx`, `strings.ts` | toggle + label for `accessRequest` | **R11a** |
| `bdd/features/auth/google_signin.feature`, `internal/auth/httpapi/google_test.go` | already updated here (unknown verified email now goes to `/waiting-for-approval`) | none |

## 8. Docs to apply (R11c/R12 own these files now)

**GLOSSARY.md**, People section, add after **Admin**:
```
**Access Request**:
A verified Google account's request to sign in, waiting for any User to approve or deny it; it expires after 14 days.
_Avoid_: Invite, join request, signup, application
```
Change **User** to: "Someone who signs in with Google to use the app, because an Admin added their email, a Member carries it, or a User approved their Access Request; may be linked to a Member." Change **Member**: append "May carry an email, so that person can sign in as a User." Change **Admin**: "A User who also manages the allowlist, the Members, ..." (unchanged otherwise; the Admin no longer is the only way to add Users).

**docs/spec/functional-spec.md §2**, replace line 13 with:
```
- Sign-in is Google OAuth only, and only for a verified Google email. A person signs in at once if their email is on the **allowlist** or is the email of a **Member**. Anyone else creates an **Access Request** and sees a "Waiting for approval" page, with no session and no access to any data. Any signed-in User can approve (adding a non-Admin User) or deny it; one approval is enough. A denied email may ask again after 24 hours; a request expires after 14 days. Requests are limited per IP (10 an hour), per email (3 a week) and in total (50 pending), and every approval, denial and expiry is recorded with who did it. Settings lists the pending requests, and a count badge shows on the avatar menu.
```
§3 Members: "A Member may have an email; see §2." §12 table, add row: `| Access Request | when someone asks to sign in (deferred out of quiet hours) |`. §15 Resolved decisions, append: "20. Sign-in needs approval by any User or a pre-added address (ADR 0005); defaults: one approval, 14-day expiry, 24 h deny cool-down."

## 9. Test list (all written; red where marked R)

Go domain `internal/access/access_test.go` (+ `fakes_test.go`): limits default; pre-added signs in with no request or push; User never throttled; Member-linked creates User, links, no request (R); Member-linked needs verified (R); unverified User refused (R); unverified unknown / malformed refused with no trace (R); new pending (fields, times, push once, token hashed) (R); repeat sign-in no duplicate, name refreshed, expiry fixed, token rotated (R); unverified does not refresh (R); `CleanName`, `CleanPicture`, stored fields cleaned (R); approve (new non-Admin User, audit, signs in after), approve needs no Admin, unknown/expired 404, approve after manual add, deny + audit + second deny 404, deny cool-down then new request, 3 per week, per-IP flood and reset, refreshes count towards IP limit, global cap and recovery, Users unaffected by full queue, expiry at 14 d, `Purge` + event, expired address may ask again, list order, status shows only own details, history order, `ClientIP` table (R: all).
Go store `internal/access/store/store_test.go`: migration tables, inserts and three lookups, one request per address (any case) and unique token, refresh keeps times, list/count/expire/delete, events count/last/order, audit survives actor removal (R: all).
Go HTTP `internal/access/httpapi/httpapi_test.go` (callback + routes, uses `testkit` and `authtest`): pre-added signs in (green regression); Member-linked signs in and is linked; unknown verified -> waiting page, no session, cookie flags, listed; unverified refused; repeat keeps one; pending visitor 401 on 15 paths and cannot approve; status reveals only own details, `no-store`, anonymous gets `none`, tokens don't cross; waiting SPA shell has no household data; any User approves and the person signs in, approve twice 404; routes need a session; CSRF (403 `cross_origin`, 415) on approve and deny; POST only; unknown ids 404; deny then cool-down then allowed; 10-per-IP flood and reset; 50-pending cap (with a User unaffected); 14-day expiry (list, status, approve 404, may ask again); history actors and times; mounted (R except the two green regressions and the SPA-shell check).
Go push `internal/access/httpapi/push_test.go`: `accessRequest` is a type; push to opted-in devices only, once, with the payload; deferred out of quiet hours; not pushed after the request was answered (R).
Existing, changed: `internal/auth/httpapi/google_test.go` (`...ToTheWaitingPage`), `bdd/features/auth/google_signin.feature` (two scenarios) (R).
BDD `bdd/features/auth/access_requests.feature` with `bdd/steps_access_test.go`: pre-added; Member-linked; unknown waits; unverified refused; repeat no duplicate; waiting visitor sees only own details; 6-row outline of 401 paths; another User approves and the person signs in; approving needs no Admin and adds a plain User; deny, cool-down, ask again; history; IP flood; repeated denial limit; expiry; CSRF on approve and deny; visitor cannot approve.
Web (vitest): `lib/requests`, `lib/waitingView`, `lib/liveUpdates`; hooks (`useAccessRequests` load/approve/deny/error, `useAccessBadge`, `useWaitingStatus`); `AccessRequestList`, `WaitingPage` (own details only, no household words, three states), `AccessBadge`, `AccessRequestsPage` (open to Users, approve, confirm before deny, history, already-answered), feature `index` (route, shell hook), `signedOutView.waiting`, `SignedOut.waiting`, `AppShell.accessBadge`.

## 10. Product questions (defaults used)

1. **Only approval, no removal power for Users?** Any User can add a person but only an Admin can remove one. Default kept (spec §2). Alternative: Admin approval for Admin rights only (already so).
2. **Member email.** Is "added to the family" the allowlist, a Member's email, or both? Built: both; a Member email is new and Admin-edited. If only the allowlist was meant, drop §2.6 and section 3 of the decision table.
3. **Approval is per person, not "add as Member too".** Approving creates a User only; linking to a Member stays an Admin task. Offer "link to Member" in the approve step later?
4. **Quiet hours for the push.** Built: deferred like every type except timers. Alternative: immediate.
5. **Cool-down / limits** (24 h, 3 per week, 10 per IP per hour, 50 pending) are defaults, not spec.
6. **Denied person feedback.** The page cannot say "denied" (privacy); it says "Request answered". OK?
7. **`FEEDER_TRUST_PROXY` default true** (ADR 0004 requires a proxy). Confirm, and add to deploy docs (`docs/dev/deploy.md`, Helm values).
8. **Google photo** is stored as a URL and loaded by Users' browsers from Google. Alternative: no photo (initials only) to avoid third-party requests. Built: photo allowed only from googleusercontent.com.
