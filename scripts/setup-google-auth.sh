#!/usr/bin/env bash
# Sets up the Google side of Feeder's sign-in and saves the values to .env.local.
# Contract: docs/dev/design/t6-google-auth-script.md. Tests: scripts/test/setup-google-auth_test.sh.
#
# gcloud can only check login and set the project. The consent screen and the
# Web OAuth client are created in the Console, so this script prints the exact
# URLs and values, then reads the client ID and secret the Console shows.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: setup-google-auth.sh [options]

Prepares a Google Cloud project for Feeder's Google sign-in and writes the
OAuth client ID and secret to the local env file (default: .env.local).

Options:
  --project ID         GCP project to use (default: the project gcloud is configured with)
  --create-project     create the project if it does not exist (needs --project; asks first)
  --base-url URL       public URL of the deployment, e.g. https://feeder.example.com
                       (default: http://localhost:8080)
  --admin-email EMAIL  Google account that is the Feeder admin (prompted if omitted)
  --env-file PATH      env file to write (default: <repo root>/.env.local)
  --yes                confirm project creation without asking
  --dry-run            print every step; change nothing and run no gcloud command
  --help               show this help

Environment (skips the prompts when set):
  FEEDER_GOOGLE_CLIENT_ID, FEEDER_GOOGLE_CLIENT_SECRET

The client secret is never accepted as an argument, so it cannot show up in ps.
Exit codes: 0 ok, 1 runtime failure (gcloud missing, not logged in, gcloud error),
2 usage error.
USAGE
}

die() { # die CODE MESSAGE...
  local code="$1"
  shift
  printf 'error: %s\n' "$*" >&2
  exit "$code"
}

# --- arguments (builtins only until the gcloud check, so a missing gcloud is reported cleanly)
PROJECT=""
CREATE_PROJECT=0
BASE_URL=""
ADMIN_EMAIL=""
ENV_FILE=""
ASSUME_YES=0
DRY_RUN=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --project | --base-url | --admin-email | --env-file)
      [ "$#" -ge 2 ] || { usage >&2; die 2 "$1 needs a value"; }
      case "$1" in
        --project) PROJECT="$2" ;;
        --base-url) BASE_URL="$2" ;;
        --admin-email) ADMIN_EMAIL="$2" ;;
        --env-file) ENV_FILE="$2" ;;
      esac
      shift 2
      ;;
    --create-project) CREATE_PROJECT=1; shift ;;
    --yes) ASSUME_YES=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help | -h) usage; exit 0 ;;
    *) usage >&2; die 2 "unknown option: $1" ;;
  esac
done

# --- repo root and defaults
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[ "$SCRIPT_DIR" != "${BASH_SOURCE[0]}" ] || SCRIPT_DIR="."
REPO_ROOT="${FEEDER_REPO_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
[ -n "$ENV_FILE" ] || ENV_FILE="$REPO_ROOT/.env.local"
[ -n "$BASE_URL" ] || BASE_URL="http://localhost:8080"

# --- validation (pure)
is_valid_email() {
  [[ $1 =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]
}

is_valid_base_url() {
  [[ $1 =~ ^https://[^[:space:]/]+(/[^[:space:]]*)?$ ]] ||
    [[ $1 =~ ^http://localhost(:[0-9]+)?(/[^[:space:]]*)?$ ]]
}

has_newline() {
  case "$1" in
    *$'\n'*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ "$CREATE_PROJECT" -eq 1 ] && [ -z "$PROJECT" ]; then
  usage >&2
  die 2 "--create-project needs --project ID"
fi

BASE_URL="${BASE_URL%/}"
is_valid_base_url "$BASE_URL" ||
  die 2 "--base-url must be https://... or http://localhost[:port] (got a different scheme or host)"

if [ -n "$ADMIN_EMAIL" ]; then
  is_valid_email "$ADMIN_EMAIL" || die 2 "--admin-email is not an email address"
  ADMIN_EMAIL="${ADMIN_EMAIL,,}"
fi

# Origin of the public base URL (scheme://host[:port]), for the Console guidance.
[[ $BASE_URL =~ ^(https?://[^/]+) ]]
BASE_ORIGIN="${BASH_REMATCH[1]}"

# --- gcloud: login check and project (never anything that changes billing or enables APIs)
if [ "$DRY_RUN" -eq 0 ]; then
  command -v gcloud >/dev/null 2>&1 ||
    die 1 "gcloud is not installed; get it from https://cloud.google.com/sdk/docs/install"
  ACCOUNTS="$(gcloud auth list --filter=status:ACTIVE --format='value(account)')" ||
    die 1 "could not list gcloud accounts"
  [ -n "$ACCOUNTS" ] || die 1 "no active gcloud account; run: gcloud auth login"
fi

if [ -z "$PROJECT" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] gcloud config get-value project\n'
    PROJECT="<configured project>"
  else
    PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
    [ -n "$PROJECT" ] ||
      die 1 "no project: pass --project ID, or set one with: gcloud config set project ID"
  fi
fi

if [ "$CREATE_PROJECT" -eq 1 ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '[dry-run] gcloud projects describe %s\n' "$PROJECT"
    printf '[dry-run] gcloud projects create %s   (only if describe finds no project)\n' "$PROJECT"
  elif ! gcloud projects describe "$PROJECT" >/dev/null 2>&1; then
    if [ "$ASSUME_YES" -eq 0 ]; then
      [ -t 0 ] || die 2 "project $PROJECT does not exist; re-run with --yes to create it"
      CONFIRM=""
      read -r -p "Project $PROJECT does not exist. Create it? [y/N] " CONFIRM || CONFIRM=""
      case "$CONFIRM" in
        y | Y | yes | YES) ;;
        *) die 2 "project creation cancelled" ;;
      esac
    fi
    gcloud projects create "$PROJECT" || die 1 "gcloud projects create $PROJECT failed"
  fi
fi

if [ "$DRY_RUN" -eq 1 ]; then
  printf '[dry-run] gcloud config set project %s\n' "$PROJECT"
else
  gcloud config set project "$PROJECT" || die 1 "could not set the gcloud project to $PROJECT"
fi

# --- Console guidance (gcloud cannot create the consent screen or the Web OAuth client)
print_console_guidance() {
  cat <<GUIDE

Next, in the Google Cloud Console (project: $PROJECT):

1. Branding: app name, support email and developer contact.
   https://console.cloud.google.com/auth/branding?project=$PROJECT

2. Audience: choose External (Internal needs a Google Workspace organisation).
   Leave publishing status on Testing, and add the admin and every household
   member as test users (Testing mode allows up to 100).
   https://console.cloud.google.com/auth/audience?project=$PROJECT

3. Data access: add the scopes openid, email and profile. Nothing else.

4. Clients: create a client of type "Web application".
   https://console.cloud.google.com/auth/clients/create?project=$PROJECT
   Authorised JavaScript origins:
     http://localhost:8080
GUIDE
  if [ "$BASE_ORIGIN" != "http://localhost:8080" ]; then
    printf '     %s\n' "$BASE_ORIGIN"
  fi
  printf '%s\n' "   Authorised redirect URIs:"
  printf '     %s\n' "http://localhost:8080/auth/google/callback"
  if [ "$BASE_ORIGIN" != "http://localhost:8080" ]; then
    printf '     %s\n' "$BASE_URL/auth/google/callback"
  fi
  cat <<GUIDE
   Google accepts only https redirect URIs for non-localhost hosts.

5. Copy the Client ID and the client secret that the Console shows.

GUIDE
}
print_console_guidance

# --- client ID and secret: environment first, then prompts (EOF is an error, never a hang)
CLIENT_ID="${FEEDER_GOOGLE_CLIENT_ID:-}"
CLIENT_SECRET="${FEEDER_GOOGLE_CLIENT_SECRET:-}"

if [ "$DRY_RUN" -eq 0 ]; then
  if [ -z "$ADMIN_EMAIL" ]; then
    read -r -p "Admin Google email: " ADMIN_EMAIL ||
      die 2 "no admin email given; pass --admin-email EMAIL"
    is_valid_email "$ADMIN_EMAIL" || die 2 "the admin email is not an email address"
    ADMIN_EMAIL="${ADMIN_EMAIL,,}"
  fi
  if [ -z "$CLIENT_ID" ]; then
    read -r -p "OAuth client ID: " CLIENT_ID ||
      die 2 "no OAuth client ID given; set FEEDER_GOOGLE_CLIENT_ID or enter it at the prompt"
  fi
  if [ -z "$CLIENT_SECRET" ]; then
    read -r -s -p "OAuth client secret (input hidden): " CLIENT_SECRET ||
      die 2 "no OAuth client secret given; set FEEDER_GOOGLE_CLIENT_SECRET or enter it at the prompt"
    printf '\n' >&2
  fi
  [ -n "$CLIENT_ID" ] || die 2 "the OAuth client ID is empty"
  [ -n "$CLIENT_SECRET" ] || die 2 "the OAuth client secret is empty"
  has_newline "$CLIENT_ID" && die 2 "the OAuth client ID contains a newline"
  has_newline "$CLIENT_SECRET" && die 2 "the OAuth client secret contains a newline"
fi

# --- env file writing

# shell_quote VALUE: single-quote a value so `set -a; . .env.local` reads it back unchanged.
shell_quote() {
  local s="${1//\'/\'\\\'\'}"
  printf "'%s'" "$s"
}

# Keys written, in order, with their values.
ENV_KEYS=(FEEDER_GOOGLE_CLIENT_ID FEEDER_GOOGLE_CLIENT_SECRET FEEDER_BASE_URL FEEDER_ADMIN_EMAIL)
declare -A ENV_VALUE=()
ENV_VALUE[FEEDER_GOOGLE_CLIENT_ID]="$CLIENT_ID"
ENV_VALUE[FEEDER_GOOGLE_CLIENT_SECRET]="$CLIENT_SECRET"
ENV_VALUE[FEEDER_BASE_URL]="$BASE_URL"
ENV_VALUE[FEEDER_ADMIN_EMAIL]="$ADMIN_EMAIL"

# write_env_file: replace each key's line in place (first occurrence; later duplicates
# are dropped), keep every other line byte for byte, append missing keys, then chmod 600.
write_env_file() {
  local file="$1" tmp line key re matched
  local -A seen=()
  tmp="$(mktemp "$file.XXXXXX")" || die 1 "cannot create a temporary file next to $file"
  {
    if [ -f "$file" ]; then
      while IFS= read -r line || [ -n "$line" ]; do
        matched=""
        for key in "${ENV_KEYS[@]}"; do
          re="^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*="
          if [[ $line =~ $re ]]; then
            matched="$key"
            break
          fi
        done
        if [ -z "$matched" ]; then
          printf '%s\n' "$line"
        elif [ -z "${seen[$matched]:-}" ]; then
          seen[$matched]=1
          printf '%s=%s\n' "$matched" "$(shell_quote "${ENV_VALUE[$matched]}")"
        fi
      done <"$file"
    fi
    for key in "${ENV_KEYS[@]}"; do
      if [ -z "${seen[$key]:-}" ]; then
        printf '%s=%s\n' "$key" "$(shell_quote "${ENV_VALUE[$key]}")"
      fi
    done
  } >"$tmp" || { rm -f -- "$tmp"; die 1 "could not write $file"; }
  chmod 600 "$tmp"
  mv -f -- "$tmp" "$file"
}

# ensure_gitignore FILE: add FILE's path (relative to the repo root) to .gitignore when it is inside the repo.
gitignore_entry() {
  case "$1" in
    "$REPO_ROOT"/*) printf '%s' "${1#"$REPO_ROOT"/}" ;;
    *) return 1 ;;
  esac
}

ensure_gitignore() {
  local rel gi="$REPO_ROOT/.gitignore" last
  rel="$(gitignore_entry "$ENV_FILE")" || return 0
  if [ -f "$gi" ] && grep -qxF -- "$rel" "$gi"; then
    return 0
  fi
  if [ -s "$gi" ]; then
    last="$(tail -c 1 -- "$gi"; printf x)"
    last="${last%x}"
    if [ "$last" != $'\n' ]; then
      printf '\n' >>"$gi"
    fi
  fi
  printf '%s\n' "$rel" >>"$gi"
}

if [ "$DRY_RUN" -eq 1 ]; then
  [ -n "$CLIENT_ID" ] || CLIENT_ID="<entered at the prompt>"
  ENV_VALUE[FEEDER_GOOGLE_CLIENT_ID]="$CLIENT_ID"
  [ -n "$ADMIN_EMAIL" ] || ADMIN_EMAIL="<admin email>"
  ENV_VALUE[FEEDER_ADMIN_EMAIL]="$ADMIN_EMAIL"
  printf '[dry-run] write FEEDER_GOOGLE_CLIENT_ID=%s\n' "$(shell_quote "$CLIENT_ID")"
  printf '[dry-run] write FEEDER_GOOGLE_CLIENT_SECRET=********\n'
  printf '[dry-run] write FEEDER_BASE_URL=%s\n' "$(shell_quote "$BASE_URL")"
  printf '[dry-run] write FEEDER_ADMIN_EMAIL=%s\n' "$(shell_quote "$ADMIN_EMAIL")"
  printf '[dry-run] chmod 600 %s\n' "$ENV_FILE"
  if rel="$(gitignore_entry "$ENV_FILE")"; then
    printf '[dry-run] ensure %s in %s/.gitignore\n' "$rel" "$REPO_ROOT"
  fi
  printf '\n[dry-run] nothing was changed and no gcloud command was run.\n'
  exit 0
fi

write_env_file "$ENV_FILE"
ensure_gitignore

# --- summary (the secret is masked)
cat <<SUMMARY

Saved to $ENV_FILE (mode 600):
  FEEDER_GOOGLE_CLIENT_ID=$CLIENT_ID
  FEEDER_GOOGLE_CLIENT_SECRET=********
  FEEDER_BASE_URL=$BASE_URL
  FEEDER_ADMIN_EMAIL=$ADMIN_EMAIL

gcloud project: $PROJECT. No APIs were enabled: plain Google sign-in needs none.
Redirect URI the app serves: $BASE_URL/auth/google/callback
SUMMARY
