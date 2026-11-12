# QA-3: sign-in pages, background and wording (1.0.0-beta.4.1)

## 1. Dark-mode background

QA saw about #121512 behind the sign-in and waiting pages in dark mode. The token chain was traced end to end:

- `styles.css`: `body { background: var(--color-background) }`, `--color-background: var(--color-bg)` (light `:root`), and `--color-bg: #090f0b` in
  `[data-scheme='dark']` and in the `prefers-color-scheme: dark` block. `ThemeProvider` (mounted in `AppProviders`, so also while signed out, with the
  default accent #3f7d58) writes the generated `bg`, which is #090f0b (Basil dark golden).
- `index.html` boot paint and `theme-color` metas: #e7f4eb / #090f0b, identical to the tokens.
- `signin.css` and `access.css` hold no colour literal and no background; the pages sit on `body`.
- A headless Chrome run of the dev build, signed out (401 on `/api/me`), dark: the page pixel is #090f0b.

So no hard-coded colour was found, and the symptom did not reproduce. The QA captures show the same #111613 on signed-in dark pages (1440-dark.png,
390-dark-menu.png), and the light captures are off by one from the token (#e6f4ea vs #e7f4eb): the capture path shifts dark values, it is not specific to
sign-in. The only way the pages differ from the shell is that `.signin` (a `min-height: 100vh` grid) has no background of its own and relies on the
html/body/canvas propagation.

Fix (hardening, small): `.signin { background: var(--color-background); }`, so the pages name the app token themselves in both themes. Tests pin that, the
body rule, the dark `--color-bg` blocks and the boot paint, so any future drift (a literal, a second dark) goes red.

## 2. Copy

GLOSSARY: Access Request _Avoid_: Invite, join request, signup, application. User _Avoid_: Account, login. "address" is not a term and is not listed;
the GLOSSARY says "email", so "address" goes too. "Allowlist" is a settings screen name, not a GLOSSARY term (noted for the lead; not edited here).
The UI calls an Access Request a "sign-in request" (GLOSSARY note).

Strings that break the rule (`web/src/features/signin/strings.ts`): `intro` ("address", "invited"), `notInvitedTitle` ("Not invited"), `notInvitedText`
("isn't invited yet", lower-case "allowlist"). The access strings are clean ("asked to join" is fine: only "join request" is avoided).

Proposed wording (the meaning is clear, so one proposal, not a product question):

| key | text |
|---|---|
| `intro` | Feeder is a private app for one Household. Sign in with a Google email that is on the Allowlist. If yours is not, Feeder sends a sign-in request for a User to approve. |
| `notInvitedTitle` | Not on the Allowlist |
| `notInvitedText` | This Google sign-in is not on the Allowlist yet. Ask an Admin to add your email to the Allowlist, then sign in again. |

Route `/not-invited`, `NotInvitedPage` and key names stay (URLs are contract); the Developer may rename the identifiers. Existing tests that looked for the
heading "Not invited" are updated to "Not on the Allowlist".

## 3. Guard

`scripts/check-ui.rules`: `glossary.fail_paths` already lists `web/src/features/signin` but not `web/src/features/access`. Why "invited" got through anyway:
`rule_glossary` matches an Avoid word only with an optional `s`/`es` suffix, so "invite" never matched "invited", "inviting". Two changes:

1. `has()` in `rule_glossary` also accepts `d`, `ed` and `ing` after the avoid word (whole-word boundaries kept: "investigate", "inventory" pass).
   "invitation" is not an inflection; the strings test covers it.
2. Add `web/src/features/access` to `glossary.fail_paths`.

Doing (1) may surface other inflected hits in strings.ts files (run `scripts/check-ui.sh`); fix the strings or add a reasoned `check-ui.allow-glossary` entry.

## Red tests

- `web/src/features/signin/signin.css.test.ts`: `.signin paints var(--color-background)` (rest of that block is a green regression pin).
- `web/src/features/signin/strings.glossary.test.ts`: no invite*/address (account, join request, signup, application pass today), intro wording, not-on-Allowlist title and text.
- `signin.test.tsx`, `SignedOut.waiting.test.tsx`, `app/AppRoot.test.tsx`: heading "Not on the Allowlist".
- `scripts/test/check-ui_test.sh`: `glossary-inflect` fixture (3 flagged, look-alikes pass); `access` in `glossary.fail_paths`; no glossary violation under signin/access in the real tree.
