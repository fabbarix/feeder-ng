# T6 - Google sign-in setup script

Files: `scripts/setup-google-auth.sh`, `scripts/test/setup-google-auth_test.sh`, one line `.env.local` in `.gitignore`.
Run the tests with `bash scripts/test/setup-google-auth_test.sh` (plain bash, fake `gcloud` first on PATH, temp dirs; no real gcloud call is ever made).

## What gcloud can and cannot do
- Can: check it is installed and logged in, create/select a project, set it as the active project, enable APIs.
- Cannot: create the standard (non-IAP) OAuth consent screen or a Web application OAuth client. `gcloud iap oauth-*` only covers IAP clients, which are the wrong kind. So the script prints the exact console URLs and values, then prompts for the Client ID and secret that the Console shows.
- APIs to enable: **none**. Plain Google sign-in (OpenID Connect with scopes `openid email profile`) needs no API to be enabled; the People API is only for reading contacts or profile extras, which Feeder does not do. The script therefore enables nothing and says so.

## Callback path (decision for T1)
T0 defines no auth route. Decision: the OAuth callback is **`GET /auth/google/callback`**. T1 must serve exactly this path and build the redirect URI as `FEEDER_BASE_URL + /auth/google/callback`.

## Environment keys written (all read by internal/config)
`FEEDER_GOOGLE_CLIENT_ID`, `FEEDER_GOOGLE_CLIENT_SECRET`, `FEEDER_BASE_URL`, `FEEDER_ADMIN_EMAIL`. Nothing GCP-specific (no project id): the app never reads it. `FEEDER_ADDR`, `FEEDER_DATA_DIR`, `FEEDER_DEV_LOGIN` are left alone.

## CLI
`setup-google-auth.sh [--project ID] [--create-project] [--base-url URL] [--admin-email EMAIL] [--env-file PATH] [--yes] [--dry-run] [--help]`
- `--env-file` default: `<repo root>/.env.local`. Repo root = `$FEEDER_REPO_ROOT` if set (tests), else the parent of `scripts/`.
- `--yes`: auto-confirm project creation. Without a terminal and without `--yes`, creation is refused (exit 2).
- Values may come from the environment instead of prompts: `FEEDER_GOOGLE_CLIENT_ID`, `FEEDER_GOOGLE_CLIENT_SECRET` (so it runs non-interactively); otherwise prompts read stdin, the secret with `read -s`. A missing required value with no input (EOF) is an error (exit 2), never a hang.
- `--base-url`: public URL of the deployment, no trailing slash kept. Must be `https://...` or `http://localhost[:port]`; else exit 2. Omitted: dev default `http://localhost:8080` (the spec names no deploy host).
- `--admin-email`: required (prompted if missing), must contain `@`, stored lower-cased (as internal/config does).
- Exit codes: 0 ok, 1 runtime failure (gcloud missing, not logged in, gcloud error), 2 usage error.

## Flow
1. Parse args; `--help` prints usage and exits 0.
2. Dry-run prints every step and runs nothing (no gcloud at all, not even read-only calls, and no file is created or changed). Lines start `[dry-run] `: `gcloud ...` for each command, `write KEY=value` for each env key and `chmod 600`, `ensure .env.local in .gitignore`. The secret is shown as `********`.
3. Real run: `command -v gcloud`; `gcloud auth list --filter=status:ACTIVE --format=value(account)` must be non-empty.
4. Project: `--project ID`, else `gcloud config get-value project`; empty and no `--create-project` is an error. With `--create-project` (needs `--project ID`): `gcloud projects describe ID`; if it does not exist, confirm then `gcloud projects create ID`. Then `gcloud config set project ID`. No other gcloud mutation; no API enabling; never touches billing.
5. Print console guidance for project ID (new Google Auth Platform pages):
   - Branding/consent screen: `https://console.cloud.google.com/auth/branding?project=ID`
   - Audience and test users: `https://console.cloud.google.com/auth/audience?project=ID`
   - Data access (optional, `openid`, `email`, `profile` are non-sensitive, so no review): `https://console.cloud.google.com/auth/scopes?project=ID`
   - Create client: `https://console.cloud.google.com/auth/clients/create?project=ID`
   - Values: User type **External** (Internal needs a Google Workspace org); publishing status Testing, add the admin email (and every household member) as test users; scopes `openid`, `email`, `profile`; application type **Web application**; authorised JavaScript origins `http://localhost:8080` plus the base URL origin; authorised redirect URIs `http://localhost:8080/auth/google/callback` plus `<base-url>/auth/google/callback`. Note: Google only accepts non-localhost redirect URIs over https. Testing mode allows up to 100 test users.
6. Obtain client id and secret (env, else prompt; empty value is an error).
7. Write the env file: create if missing; for each key replace its line in place if present (`KEY=value`, also tolerates `export KEY=` and spaces, keeping a single line), else append; every other line (comments, other keys, blank lines) preserved byte for byte; values containing special characters are written raw after `=` (no quoting; the dev loader of `.env.local` is documented as `set -a; . .env.local`, so values are single-quoted: `KEY='value'`). Then `chmod 600`.
8. Ensure `.env.local` line in `<repo root>/.gitignore` (append if absent, only when the env file lies inside the repo root).
9. Print a summary with the secret masked (`********`), never the value. Secret must never appear in stdout/stderr, nor in the fake gcloud's argv.

## Web Push (spec section 12)
No Google/GCP setup is needed. Web Push uses the standard protocol with **VAPID keys**: the server generates its own P-256 key pair, and each browser subscription carries an endpoint on the browser's push service (Chrome uses FCM's endpoint, Firefox autopush, Safari Apple's). The server posts encrypted payloads to that endpoint signed with the VAPID key; no GCP project, FCM sender id or Firebase config is required for VAPID-based Web Push. Generating and persisting the VAPID keys belongs to the notifications team, not this script. (Safari/iOS additionally needs the PWA installed to the home screen; not a GCP matter.)

## Decisions
- Client secret handling: never as an argument (visible in `ps`), only env or `read -s`.
- Quote values in `.env.local` with single quotes so it can be sourced by a shell; Docker `--env-file` users should not use this file (it is for local dev).
