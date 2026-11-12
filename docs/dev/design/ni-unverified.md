# NI: the unverified-email page says what is wrong

## Problem
`/not-invited` is shown when Google has not verified the email, or the email is malformed (`access.Unverified`, redirected from
`internal/auth/httpapi/google.go`). It is not shown for Allowlist misses (those become an Access Request and the waiting page). The old copy
("Not on the Allowlist", "Ask an Admin to add your email to the Allowlist") pointed to the wrong fix, and the route and identifiers say "invited",
an Avoid word.

## Decision (final, from the user)
Copy: body **"Google has not verified this email."** only; the link below it keeps "Use a different Google sign-in" (the sentence is not repeated). Title: **"Email not verified"**.

## Names chosen
GLOSSARY has no term for this page; it uses only words the GLOSSARY allows ("Google sign-in"; "email" is plain English, "account" is avoided).

| Old | New |
| --- | --- |
| route `/not-invited` | `/email-not-verified` |
| `NotInvitedPage` | `EmailNotVerifiedPage` |
| `notInvitedTitle` / `notInvitedText` | `emailNotVerifiedTitle` / `emailNotVerifiedText` |
| `SignedOutView` kind `'not-invited'` | `'email-not-verified'` |
| (new) kind | `{ view: 'redirect'; to: string }` |

The link "Use a different Google sign-in" (`tryAnother`) is unchanged.

## Behaviour
- Go: the callback redirects `Unverified` to `/email-not-verified` (was `/not-invited`); `internal/access/access.go` comment updated.
- Signed out: `/email-not-verified` (and with a trailing slash) renders the page. `/not-invited` (with or without slash) yields
  `{ view: 'redirect', to: '/email-not-verified' }` and `SignedOut` renders `<Navigate replace>`.
- Signed in: `/email-not-verified` redirects to `/`; `/not-invited` redirects to `/email-not-verified` (which then goes to `/`).
- `app/pageWidths.ts` lists both routes as `default` (the table test requires every feature route to be listed). The page-layout guard
  (`scripts/lib/page-layout-rules.mjs`, `check-page-layout.modes`) does not list sign-in routes, so it needs no change.
- UI guard: the glossary rule reads `strings.ts`, where the new copy has no Avoid word; `/not-invited` lives only in `signedOutView.ts` and
  `index.ts` (not scanned). `scripts/check-ui.rules` and its allow lists need no change.

## Tests (written first, red until implemented)
- `signin/strings.glossary.test.ts`: title and text exact; no Allowlist/Admin; no `invit*` key.
- `signin/components/signin.test.tsx`, `SignedOut.waiting.test.tsx`, `app/AppRoot.test.tsx`: page at `/email-not-verified`; old route lands on it.
- `signin/lib/signedOutView*.test.ts`: the view kinds above.
- `signin/index.test.ts`: the four routes and the signed-in redirects.
- Go: `internal/auth/httpapi/google_test.go`, `internal/access/httpapi/httpapi_test.go` expect `/email-not-verified`.
- BDD: `auth/google_signin.feature` and `auth/access_requests.feature` expect the redirect to `/email-not-verified`.
