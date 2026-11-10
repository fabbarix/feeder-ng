# A1 Access Requests: sign-in approval

Scope: functional-spec §2 (access) and §12 (notifications), [ADR 0005](../../adr/0005-sign-in-needs-approval.md). **Revision 2** (user decisions after phase 1) is folded into each section below and summarised in §11; the changed parts are marked *(rev 2)*. Request: "people can login only after their e-mail is approved by another user or if their address was added to the family, so not everyone can just login with a Google account." Tests are written first (red); the Developer implements until `scripts/check.sh` passes. Domain term: **Access Request** (GLOSSARY has no better word; `_Avoid_`: invite, signup, join request).

## 1. Current state against the request

| Wanted | Today | Gap |
|---|---|---|
| Pre-added address signs in at once | **Works.** `internal/auth/httpapi/google.go` looks the verified email up in `users` (`UserByEmail`) and starts a session. The allowlist (Settings, Admin) and `FEEDER_ADMIN_EMAIL` both add rows to `users`. Covered by `google_signin.feature` and `google_test.go`. | none |
| Member-linked email signs in | **Does not exist.** `members` has no email column (`0100_household.sql`); a Member is linked to an existing User by id (`PUT /api/members/{id}/user`, `members.user_id`). A Member only signs in because an Admin first added the same person to the allowlist and then linked them. Nothing reads an address from a Member. | New: an optional **Member email**. A verified Google sign-in whose address equals the email of a not-yet-linked Member creates the User and links it. |
| Unknown Google accounts must not get in | **Works, but dead-ends.** Unknown or unverified email -> `/not-invited` ("Ask an Admin to add your email"), no session, no row. | Replace the dead end for *verified* unknown accounts with an Access Request and a waiting page. Unverified stays on `/not-invited`. |
| Approval by any User | Only an **Admin** can add to the allowlist (`r.Admin("POST /api/allowlist")`). | New `r.User` routes; approval adds a non-Admin User and, *(rev 2)*, can link an unlinked Member in the same step. |
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
| 3 | verified and a Member with that email has no User *(rev 2: and the address is not a User, which row 1 already settled)* | `SignedIn` | `AddUser` (non-Admin, name = Google name) + `Members.LinkUser`; then as 1 |
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
Any signed-in User (`r.User`). `POST /api/access-requests/{id}/approve`: `AddUser(email, cleaned Google name, isAdmin=false)`, delete the request, `approved` event with actor id and email *(rev 2: and the linked Member)*, live event.

**Approve with "link to Member" (rev 2, decision A3).** Body (all optional, JSON): `{"memberId": 3}`. An empty body, `{}` and `{"memberId": null}` mean "no Member" (the phase 1 behaviour). Service: `Approve(ctx, id, actor)` as before and `ApproveLinked(ctx, id, actor, memberID)`. Order in `ApproveLinked`: (1) load the unexpired request, else `ErrNotFound`; (2) check `memberID` is in `Members.Unlinked(ctx)`, else `ErrMemberUnavailable` (also when the service has no Members port, i.e. phase 1) with **nothing created and the request still pending**; (3) `AddUser` (an `ErrEmailTaken` race resolves to the existing User, as in `Approve`); (4) `Members.LinkUser(memberID, user.ID)`, whose `ErrMemberUnavailable` (Member linked or deleted meanwhile) is returned as is, leaving the request pending so the approver can choose again (the User row may already exist; retrying is safe); (5) delete the request; (6) `approved` event with `MemberID` and `MemberName` (snapshots, no foreign key). The approver does not need to be an Admin; a Member's link is not an Admin power here because it only attaches a brand-new User to a Member that had none. Removing Users stays Admin-only.

| Request body | Result |
|---|---|
| none, `{}`, `{"memberId":null}` | 200, as before |
| `{"memberId":"x"}`, `1.5` or other bad JSON | 400 `bad_request` |
| `{"memberId":0}` or negative | 422 `validation_failed` (field `memberId`) |
| Member unknown, or already has a User | 409 `member_unavailable`; no User created; the request stays pending |
| request unknown, expired or answered | 404 `not_found` (checked first) |

The history route adds `memberName` (`""` when none) to every event. If the address became a User meanwhile (`ErrEmailTaken`) the request is simply cleared (idempotent). `POST .../deny`: delete the request, `denied` event. Both 404 for unknown or expired ids; a second answer to the same request gets 404 (the UI shows "already answered"). Self-approval is impossible: a visitor has no session.

### 2.4 Notifications
New type `accessRequest` (spec §12 row "Access Request: when someone asks to sign in; deferred out of quiet hours"). It goes through the existing fact pipeline so quiet hours, Grace and once-only dedupe come for free: `Facts.AccessRequests []AccessRequestFact{ID, Name, Email, RequestedAt}` (pending requests, read by `notify/facts`), `Compute` turns each into a `Candidate{Key: "accessRequest:<id>@<requestedAt>", At: RequestedAt, Title: "New sign-in request", Body: "<name> (<email>) wants to join Feeder", URL: "/settings/access-requests"}`. Opt-in is per device like every type (off by default). A request answered before its push is due is no longer a fact, so it is not pushed. The text comes from Google, so the push body is plain text and length-capped (200 chars).

### 2.5 Live updates and the shell badge
The module publishes `access` `{"changed":"requests"}` on create, approve, deny and purge (`OnRequested` plus the handlers). The `access` feature exports `useShellStatus` returning `pendingAccessRequests` (polls `GET /api/access-requests` and refetches on the event). The shell shows a badge on the avatar button (`aria-label` "Your menu, 3 sign-in requests waiting") and a "Sign-in requests" item in the avatar menu while the count is above 0. Settings gets a row "Sign-in requests" in the Household group for every User, with the count as its meta.

### 2.6 Member email *(rev 2, decision A1: both routes stay; phase 2)*
`members.email` (nullable, case-insensitive unique). Admin sets it in the Member editor (`email` in `POST/PATCH /api/members`). It is shown to Users in the Members list like the name. A sign-in matches only a Member that has **no User yet**; after linking, the User row is authoritative and the Member email is only a label.

**It must not hijack an existing User.**
- Sign-in order is fixed (table 2.1): a User with that address signs in as that User (row 1) *before* any Member email is read; a Member email never links a Member to an existing User, never creates a second User and never changes a User's name or role.
- The address is unique across **Members, Users and the allowlist** (the allowlist *is* the `users` table), case-insensitive, in both directions: the Member API refuses an address that belongs to another Member or to any User, and `POST /api/allowlist` refuses an address that is a Member's email.
- The one allowed overlap: a Member that is linked to User X may carry X's own address (nothing is ambiguous).
- A Member email that is already a User's address when it reaches the sign-in code (data from before the rule, or a race) is simply ignored there.
- An Access Request whose address later becomes a Member email is not special: if it is approved, the User row wins and the Member stays unlinked with a label email (an Admin can link it); sign-in then finds the User first.

**Member-edit API** (`POST /api/members`, `PATCH /api/members/{id}`; Admin only; PATCH replaces the Member, so an omitted `email` clears it):

| Input | Result |
|---|---|
| `email` omitted, `null`, `""` or blanks | no email; every Member in responses has `"email": null` or the string |
| a valid address | trimmed, lower-cased, stored; 201/200 returns it |
| not `name@host` (no `@`, empty side, spaces, two `@`, a list), or over 254 characters | 422 `validation_failed`, message names `email` |
| not a JSON string | 400 `bad_request` |
| same address (any case) as another Member | 409 `email_taken` |
| the address of any User or allowlist entry (other than the Member's own linked User) | 409 `email_taken` |
| the Member's own value again on PATCH | 200 (no self-conflict) |

The response of a conflict is `{"error":{"code":"email_taken","message":"That email already belongs to a Member, a User or the allowlist"}}`. Clearing or deleting a Member frees its address. `POST /api/allowlist` of a Member's email returns the existing `409 email_taken`, with the same wording.

## 3. Threat model

| Threat | Mitigation |
|---|---|
| Stranger with any Google account gets in | No session without a User row; approval is by a signed-in User; every `/api` data route stays `RequireUser`. Test: pending visitor gets 401 on household, allowlist and events routes. |
| Unverified or spoofed email | `email_verified` required for all paths (1, 3, 5, 9); unverified neither signs in, nor creates, nor refreshes a request. |
| Queue flood by script | Google sign-in is the only entry, so each submission needs a real Google round trip; still: 10 per IP per hour, 3 per address per week, 24 h cool-down after denial, 50 pending globally, one row per address (UNIQUE NOCASE), 14-day expiry, name <= 100 chars, picture <= 500 chars. |
| IP spoofing via `X-Forwarded-For` | *(rev 2)* `FEEDER_TRUST_PROXY` defaults to **false**: `ClientIP` is then the socket peer (`RemoteAddr` host) and the header is ignored, so a direct-exposed container cannot be talked past the IP limit. With it on (the Helm chart sets it when an ingress is enabled) only the **last** entry is used (appended by the operator's proxy). Behind a proxy with the setting left off every visitor shares the proxy's address, so the per-IP limit becomes a global 10 an hour: the deploy docs say to turn it on. The per-address, cool-down and global limits do not depend on it. |
| Approving the wrong person / CSRF | POST only; JSON/same-Origin guard applies (`cross_origin` 403, `unsupported_media_type` 415); SameSite=Lax session. A malicious site cannot approve. Deny asks for confirmation in the UI. |
| Stored XSS via Google name or photo | Name is control-char stripped and length-capped, rendered as React text; picture kept only if `https://*.googleusercontent.com` and <= 500 chars, else dropped (no arbitrary image fetch from other Users' browsers). *(rev 2)* If the allowed image still fails to load, the UI shows initials (`RequestAvatar`). Push body is plain text. |
| Information leak to a pending visitor | No session, so all routes 401; the waiting page shows only the visitor's own Google name/email from their own token; status for a missing token reveals nothing (not even whether the address is pending); `no-store`; the SPA shell is static. The same page text for every state avoids confirming that the household exists beyond the app's own name. |
| Token theft | Only a hash is stored; token rotates on each sign-in; cookie is path-scoped, HttpOnly; it only reveals the visitor's own Google data. It grants no access, so a stolen token is harmless. |
| Cool-down evasion by changing case / plus-addressing | Case folded. Plus-addressing (`a+1@gmail.com`) is a different verified Google identity string and is allowed; the per-IP and global caps bound it. Accepted. |
| Approval fatigue / denial of service on Users' attention | Global cap 50; push is deferred during quiet hours; per-IP limit. |
| Audit gaps | `access_events` records requested, approved, denied, expired with actor id and actor email (no foreign key: survives the actor's removal). Visible to every User at `GET /api/access-requests/history`. Removing a User later is not an Access Request event (existing allowlist behaviour). |
| A Member email takes over a User *(rev 2)* | Unique across Members, Users and the allowlist; User row wins at sign-in; the Member API and the allowlist refuse a clash (§2.6). Tests: `member_email_test.go`, `access_test.go`. |
| Approving links the wrong Member *(rev 2)* | Optional and explicit; only unlinked Members are offered and the server re-checks; the audit trail records the Member; an Admin can unlink in Settings as today. |
| An approved person is unwanted | Any User can approve, so any User can be removed by an Admin from the allowlist (sessions end at once, existing behaviour). Product question Q1 asks whether more is wanted. |

## 4. API

All JSON; errors use `{"error":{"code","message"}}`. Authentication in brackets.

| Route | Auth | Result |
|---|---|---|
| `GET /auth/google/callback` | public | as before, plus `/waiting-for-approval[?state=limited|full]` redirects and the `feeder_access` cookie |
| `GET /api/access-request/status` | public | `{status:"pending",email,name,requestedAt}` or `{status:"none"}` |
| `GET /api/access-requests` | User | `{requests:[{id,email,name,picture,requestedAt,expiresAt}], count}`, oldest first, unexpired only |
| `POST /api/access-requests/{id}/approve` | User | body `{memberId?}` (§2.3); 200 `{id,email,displayName,isAdmin:false}`; 400 `bad_request`; 422 `validation_failed`; 409 `member_unavailable`; 404 `not_found` |
| `POST /api/access-requests/{id}/deny` | User | 204; 404 `not_found` |
| `GET /api/access-requests/history` | User | `{events:[{kind,email,name,at,actorEmail,memberName}]}`, newest first, 50 |
| `POST/PATCH /api/members` | Admin | accept and return optional `email` (Member email); 422 `validation_failed`, 409 `email_taken` (§2.6) |
| `POST /api/allowlist` | Admin | additionally 409 `email_taken` for a Member's email |
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
    actor_email   TEXT NOT NULL DEFAULT '',
    member_id     INTEGER,                    -- rev 2: the Member an approval linked; snapshot, no foreign key
    member_name   TEXT NOT NULL DEFAULT ''
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
Rows past retention (`access_events` older than 1 year) are pruned by the same `access.purge` job. The `member_*` columns are in 1200 itself (nothing has shipped; edit the file). Number 1200 is above R11c's 1150 (`bdd` and `db` tests that count migrations need no change; check `db_test.go` when adding).

## 6. Files

New (A1 owns all of them):
- `docs/adr/0005-sign-in-needs-approval.md`, this note.
- `internal/access/access.go` (Service, Limits, ports, `CleanName`, `CleanPicture`, `ClientIP`); skeleton exists, bodies return `ErrNotImplemented`.
- `internal/access/store/store.go` (SQLite `access.Store`); skeleton exists.
- `internal/access/httpapi/httpapi.go` (module "access": routes of §4, purge job, `access` events, cookie); only `doc.go` exists.
- `internal/access/adapters.go` or in `httpapi`: `Members` adapter over `household/store` (see wiring).
- `internal/modules/access.go`: `import _ ".../internal/access/httpapi"`.
- `internal/db/migrations/1200_access_requests.sql`.
- `web/src/features/access/`: *(rev 2: also `components/{ApproveSheet,RequestAvatar}.tsx`, `lib/members.ts`, `hooks/useUnlinkedMembers.ts`; stubs exist)* `types.ts`, `api.ts`, `strings.ts`, `lib/{requests,waitingView,liveUpdates}.ts`, `hooks/{queryKeys,useAccessRequests,useAccessBadge,useWaitingStatus}.ts` (+ a `useAccessLiveUpdates` inside `useAccessRequests`), `components/{AccessRequestList,WaitingPage,AccessBadge}.tsx`, `screens/AccessRequestsPage.tsx`, `index.ts` (route `/settings/access-requests`, `useShellStatus`), `access.css`. Skeletons exist. Copy lives in `strings.ts`; components stay free of API calls and maths (CLAUDE.md): `daysLeft`, `badgeText`, relative time are in `lib`.

## 7. Wiring edits in shared files (PM to sequence)

| File | Edit | Conflicts with |
|---|---|---|
| `internal/app/registry.go` (`Deps`) and `internal/app/app.go` | add `Access *access.Service`, built from `accessstore.New(d)`, `authSvc`, a Members adapter (*rev 2:* `ByEmail`, `Unlinked`, `LinkUser`), `Clock`, `DefaultLimits()` (`New` also reads `cfg.TrustProxy`) | none known (not `spa.go`) |
| `internal/config/config.go` | `TrustProxy bool` from `FEEDER_TRUST_PROXY`; *(rev 2)* default **false**; `1/true/yes/on` (any case, trimmed) turn it on, anything else is off. Fix the field comment. | none |
| `internal/auth/httpapi/google.go` | replace the `UserByEmail`/`/not-invited` block with `d.Access.SignIn` + the switch of §2.1; set/clear `feeder_access` | A1 only |
| `internal/notify/types.go`, `compute.go`, `notify/facts/facts.go`, `notify/httpapi` (type list), migration | `AccessRequest` type in `AllTypes` (after `timerFinished`), `Facts.AccessRequests`, `Compute` rule, facts query. **Existing notify tests that assert the exact type list/count must be updated.** | R11a (notifications UI); none in Go |
| `internal/household/{members.go,store/store.go,httpapi/members.go}`, `internal/auth/httpapi/allowlist.go` | Member `Email` field and validation, `Members` adapter methods `ByEmail`/`Unlinked`/`LinkUser`, `email_taken` rules of §2.6 (store checks `members` and `users` in one transaction; allowlist add checks `members.email`) | **R11c owns `household/store` now: do last** |
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

## 10. Product questions: resolved

| # | Question | Decision |
|---|---|---|
| Q1 / A4 | Users cannot remove people | Kept as built: any User approves, only an Admin removes. |
| Q2 / A1 | Member email or allowlist only | **Both**, plus the no-hijack and uniqueness rules of §2.6. |
| Q3 / A3 | "Link to Member" while approving | **Changed:** offered in the approve step (§2.3, §11.2). |
| Q4 / A5 | Push in quiet hours | As built (deferred). |
| Q5 / A6 | Limits | As built. |
| Q6 | Denied feedback | As built ("Request answered"). |
| Q7 / A7 | `FEEDER_TRUST_PROXY` default | **Changed to false** (§11.3, "Deploy changes"). |
| Q8 / A8 | Google photo | As built (googleusercontent.com only) **plus** an initials fallback on load failure (§11.4). |

## 11. Revision 2 details

### 11.1 Tests added (red until the Developer step; "phase 1 now" = implementable without the household adapter)
| Test | Phase |
|---|---|
| `internal/access/access_test.go`: `TestApproveLinked*` (6), `TestApproveWithoutAMember...` and `TestAMemberEmailThatAlreadyBelongsToAUser...` (green regression guards) | phase 1 now (domain, against the Members port fake) |
| `internal/access/store/store_test.go`: `TestAnApprovedEventKeepsTheLinkedMember` | phase 1 now (columns in 1200) |
| `internal/access/httpapi/approve_member_test.go`: `TestApproveAcceptsNoBody...` (green), `TestApproveRejectsABadMemberId`, `TestApproveWithAMemberThatDoesNotExist...` (phase 1: no Members port yet), `TestApproveWithAMemberStillNeeds...` (green) | phase 1 now |
| same file: `TestPhase2AnyUserApprovesAndLinks...`, `TestPhase2ApproveWithAMemberWhoAlreadyHasAUser...` | **phase 2** (household adapter) |
| `internal/access/httpapi/member_email_test.go`: all `TestPhase2*` (normalisation, validation, uniqueness, no hijack, allowlist clash, own linked User) and the existing `TestAMemberLinkedAddressSignsIn...` | **phase 2** |
| `internal/config/config_test.go`: `TestTrustProxyDefaultsToFalse...`, `TestLoadReadsAllVariables` | phase 1 now |
| `internal/access/httpapi/trustproxy_test.go`: header ignored by default, last entry used when trusted | green regression guards |
| `bdd/features/auth/access_requests.feature`: 5 scenarios after the "Approvals" block (link in one step, linked Member refused, Member email vs User, two Members, bad address) + the existing Member-email scenario | **phase 2** |
| Web: `ApproveSheet.test.tsx`, `RequestAvatar.test.tsx`, `lib/members.test.ts`, additions to `AccessRequestList`, `AccessRequestsPage`, `hooks`, `format` tests | phase 1 now (the web side has no household dependency; it uses `GET /api/members`) |

### 11.2 Approve UI (A3)
`AccessRequestList` still reports `onApprove(id)`. `AccessRequestsPage` opens **`ApproveSheet`** for that request (a `BottomSheet`, no native `<select>`, no `window.confirm`): title "Approve <email>", a line "<email> will sign in as a User", an optional picker on the shared `Select` labelled "Link to a Member (optional)" with `clearLabel` "Don't link" (nothing chosen is the default), footer buttons Cancel and Approve. The picker offers `unlinkedMembers(GET /api/members)` (Members with `userId === null`), loaded by `useUnlinkedMembers`; no unlinked Member shows "Every Member already has a User." and no picker; a failed load shows "Could not load the Members." and approving without a link still works. Approve calls `approve(id, memberId?)` (body `{memberId}` only when chosen). On success the sheet closes; on `member_unavailable` the sheet stays open with the alert "That Member already has a User. Pick another, or approve without linking.", the Members refetch and the refused pick is forgotten; on any other error (a 404 "already answered") the sheet closes and the toast speaks. The sheet closes by itself if its request is no longer pending. The history line reads "user@x approved zia@x and linked them to Nonna". Business rules (which Members are unlinked, error mapping) live in `lib/members.ts`, `lib/format.ts` and the hooks, not in the components.

### 11.3 Trust proxy off by default (A7)
`config.Load`: default false (see wiring). `access.ClientIP(remote, xff, trust)` is unchanged: with `trust` false it is the host part of `RemoteAddr`. The testkit config literal already means false, so the existing HTTP tests describe the default.

### 11.4 Photo fallback (A8)
`web/src/ui/Avatar` has no `onError`, and `web/src/ui` is not ours, so the fallback lives in `features/access/components/RequestAvatar.tsx`: it renders the shared `Avatar` with the photo and, after the image's `error` event, renders it again without `imageUrl` (initials). A new `picture` value resets the failure. `AccessRequestList` uses it. Suggest (not do) moving this into `Avatar` later so every screen benefits.

### Deploy changes (after D2 merges)
Not done here: `deploy/` and `docs/dev/deploy.md` are owned by team D2 right now.
- **Chart `values.yaml`**: add `trustProxy: null  # null = automatic: true when ingress.enabled, else false; true/false overrides`.
- **Chart deployment template**: env `FEEDER_TRUST_PROXY` = `{{ ternary "true" "false" (default .Values.ingress.enabled .Values.trustProxy) }}`. Careful: `default` treats `false` as empty, so compute explicitly: `{{- $trust := .Values.ingress.enabled -}}{{- if not (kindIs "invalid" .Values.trustProxy) -}}{{- $trust = .Values.trustProxy -}}{{- end }}` and render `{{ $trust | quote }}`. Add a `helm template` check in the chart tests (enabled -> "true", disabled -> "false", `trustProxy: false` with ingress enabled -> "false").
- **`docs/dev/deploy.md`**: document `FEEDER_TRUST_PROXY` in the environment table (default `false`; set `true` only when Feeder sits behind a reverse proxy that appends the real client address as the last `X-Forwarded-For` entry; with it off behind a proxy, all visitors share one rate limit bucket); the chart section explains `trustProxy: null` (automatic). Add a line to the Compose/plain-Docker examples.
- **`docs/spec`** environment table, if any, gets the same row.
