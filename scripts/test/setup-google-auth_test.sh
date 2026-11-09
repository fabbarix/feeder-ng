#!/usr/bin/env bash
# Tests for scripts/setup-google-auth.sh. Plain bash; a fake `gcloud` is placed first on PATH.
# No real gcloud is ever called and nothing outside a temp dir is written.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../setup-google-auth.sh"
SECRET='s3cr3t-VALUE-xyz'
PASS=0; FAIL=0

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
# Fake gcloud: logs argv, answers read-only queries, never does anything real.
cat >"$TMP/bin/gcloud" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"${GCLOUD_LOG:?}"
case "$1 $2" in
  "auth list") [ -n "${GCLOUD_NO_AUTH:-}" ] || echo "someone@example.com" ;;
  "config get-value") echo "${GCLOUD_PROJECT-stub-project}" ;;
  "projects describe") [ -z "${GCLOUD_PROJECT_MISSING:-}" ] || exit 1 ;;
esac
exit 0
STUB
chmod +x "$TMP/bin/gcloud"

# fresh sandbox per test: $ROOT (fake repo root), $ENVF, $GCLOUD_LOG
setup() {
  ROOT="$TMP/repo.$RANDOM"; mkdir -p "$ROOT"
  ENVF="$ROOT/.env.local"; export GCLOUD_LOG="$ROOT/gcloud.log"; : >"$GCLOUD_LOG"
  export FEEDER_REPO_ROOT="$ROOT"
  unset GCLOUD_NO_AUTH GCLOUD_PROJECT GCLOUD_PROJECT_MISSING FEEDER_GOOGLE_CLIENT_ID FEEDER_GOOGLE_CLIENT_SECRET
}
# run ARGS... ; stdin from $INPUT ; sets OUT (stdout+stderr) and RC
run() {
  OUT="$(PATH="$TMP/bin:$PATH" bash "$SCRIPT" "$@" <<<"${INPUT:-}" 2>&1)"; RC=$?
}
check() { # check NAME CONDITION-command...
  local name="$1"; shift
  if "$@"; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL: $name" >&2; echo "--- output (rc=$RC):" >&2; echo "$OUT" >&2; fi
}
has() { grep -qF -- "$2" "$1"; }
out_has() { grep -qF -- "$1" <<<"$OUT"; }
out_lacks() { ! grep -qF -- "$1" <<<"$OUT"; }
rc_is() { [ "$RC" -eq "$1" ]; }
mode_of() { stat -c %a "$1"; }
COMMON=(--project p-1 --admin-email Admin@Example.com --base-url https://feeder.example.com --env-file)

# --- help
setup; run --help
check "help exits 0" rc_is 0
check "help lists --dry-run" out_has "--dry-run"
check "help lists --create-project" out_has "--create-project"

# --- first write
setup; INPUT=$'client-1.apps.googleusercontent.com\n'"$SECRET"; run "${COMMON[@]}" "$ENVF"
check "first run exits 0" rc_is 0
check "client id written" has "$ENVF" "FEEDER_GOOGLE_CLIENT_ID='client-1.apps.googleusercontent.com'"
check "secret written" has "$ENVF" "FEEDER_GOOGLE_CLIENT_SECRET='$SECRET'"
check "base url written" has "$ENVF" "FEEDER_BASE_URL='https://feeder.example.com'"
check "admin email lower-cased" has "$ENVF" "FEEDER_ADMIN_EMAIL='admin@example.com'"
check "env file mode 600" test "$(mode_of "$ENVF")" = 600
check "secret never printed" out_lacks "$SECRET"
check "secret never passed to gcloud" bash -c "! grep -qF -- '$SECRET' '$GCLOUD_LOG'"
check "gcloud project set" has "$GCLOUD_LOG" "config set project p-1"
check "no API enabled" bash -c "! grep -q 'services enable' '$GCLOUD_LOG'"
check "no billing touched" bash -c "! grep -qi billing '$GCLOUD_LOG'"
check "no project created without flag" bash -c "! grep -q 'projects create' '$GCLOUD_LOG'"
check "prints redirect URI" out_has "https://feeder.example.com/auth/google/callback"
check "prints localhost redirect URI" out_has "http://localhost:8080/auth/google/callback"
check "prints clients URL" out_has "https://console.cloud.google.com/auth/clients/create?project=p-1"
check "prints branding URL" out_has "https://console.cloud.google.com/auth/branding?project=p-1"
check "prints scopes" out_has "openid"
check ".env.local added to .gitignore" has "$ROOT/.gitignore" ".env.local"

# --- idempotent update, unrelated keys preserved
setup
printf '# my notes\nFEEDER_ADDR=:9999\nFEEDER_GOOGLE_CLIENT_ID=old\nOTHER=keep me\n' >"$ENVF"; chmod 644 "$ENVF"
printf 'node_modules/\n.env.local\n' >"$ROOT/.gitignore"
INPUT=$'new-id\n'"$SECRET"; run "${COMMON[@]}" "$ENVF"
check "update exits 0" rc_is 0
check "comment preserved" has "$ENVF" "# my notes"
check "unrelated key preserved" has "$ENVF" "FEEDER_ADDR=:9999"
check "other key preserved" has "$ENVF" "OTHER=keep me"
check "client id replaced in place" has "$ENVF" "FEEDER_GOOGLE_CLIENT_ID='new-id'"
check "old client id gone" bash -c "! grep -qx 'FEEDER_GOOGLE_CLIENT_ID=old' '$ENVF'"
check "mode forced to 600" test "$(mode_of "$ENVF")" = 600
check "gitignore not duplicated" test "$(grep -cx '.env.local' "$ROOT/.gitignore")" = 1
cp "$ENVF" "$TMP/after1"
INPUT=$'new-id\n'"$SECRET"; run "${COMMON[@]}" "$ENVF"
check "second identical run leaves file identical" cmp -s "$ENVF" "$TMP/after1"
check "each key appears once" test "$(grep -c '^FEEDER_GOOGLE_CLIENT_ID=' "$ENVF")" = 1

# --- values from the environment, no prompts
setup
FEEDER_GOOGLE_CLIENT_ID=env-id FEEDER_GOOGLE_CLIENT_SECRET="$SECRET" INPUT="" run "${COMMON[@]}" "$ENVF"
check "env-provided values exit 0" rc_is 0
check "env-provided id written" has "$ENVF" "FEEDER_GOOGLE_CLIENT_ID='env-id'"

# --- dry-run changes nothing
setup; printf 'KEEP=1\n' >"$ENVF"; cp "$ENVF" "$TMP/before"
INPUT=""; run --dry-run --create-project --yes "${COMMON[@]}" "$ENVF"
check "dry-run exits 0" rc_is 0
check "dry-run leaves env file untouched" cmp -s "$ENVF" "$TMP/before"
check "dry-run runs no gcloud" test ! -s "$GCLOUD_LOG"
check "dry-run prints project create" out_has "[dry-run] gcloud projects create p-1"
check "dry-run prints set project" out_has "[dry-run] gcloud config set project p-1"
check "dry-run prints env writes" out_has "[dry-run] write FEEDER_BASE_URL"
check "dry-run masks secret" out_has "********"
check "dry-run creates no .gitignore" test ! -e "$ROOT/.gitignore"
setup; INPUT=""; run --dry-run "${COMMON[@]}" "$ENVF"
check "dry-run does not create env file" test ! -e "$ENVF"

# --- project handling
setup; export GCLOUD_PROJECT=from-config INPUT=$'id\n'"$SECRET"; run --admin-email a@b.co --base-url https://x.example --env-file "$ENVF"
check "project from gcloud config used" out_has "project=from-config"
setup; export GCLOUD_PROJECT="" INPUT=$'id\n'"$SECRET"; run --admin-email a@b.co --env-file "$ENVF"
check "no project and no flag fails" rc_is 1
setup; export GCLOUD_PROJECT_MISSING=1 INPUT=$'id\n'"$SECRET"; run --create-project --yes "${COMMON[@]}" "$ENVF"
check "create-project with --yes creates" has "$GCLOUD_LOG" "projects create p-1"
setup; export GCLOUD_PROJECT_MISSING=1 INPUT=$'id\n'"$SECRET"; run --create-project "${COMMON[@]}" "$ENVF"
check "create-project without confirmation refused" rc_is 2
check "refused creation ran no create" bash -c "! grep -q 'projects create' '$GCLOUD_LOG'"
setup; INPUT=$'id\n'"$SECRET"; run --create-project --admin-email a@b.co --env-file "$ENVF"
check "create-project without project id is usage error" rc_is 2

# --- gcloud state errors
setup; export GCLOUD_NO_AUTH=1 INPUT=$'id\n'"$SECRET"; run "${COMMON[@]}" "$ENVF"
check "not logged in fails" rc_is 1
check "not logged in writes nothing" test ! -e "$ENVF"
setup; mkdir -p "$TMP/empty"; OUT="$(PATH="$TMP/empty" /bin/bash "$SCRIPT" "${COMMON[@]}" "$ENVF" 2>&1 <<<"")"; RC=$?
check "gcloud missing fails" rc_is 1
check "gcloud missing says so" out_has "gcloud"

# --- validation
setup; INPUT=$'id\n'"$SECRET"; run --project p-1 --admin-email notanemail --env-file "$ENVF"
check "bad admin email rejected" rc_is 2
setup; INPUT=$'id\n'"$SECRET"; run --project p-1 --admin-email a@b.co --base-url http://feeder.example.com --env-file "$ENVF"
check "http non-localhost base url rejected" rc_is 2
setup; INPUT=$'id\n'"$SECRET"; run --project p-1 --admin-email a@b.co --base-url http://localhost:8080 --env-file "$ENVF"
check "http localhost base url accepted" rc_is 0
setup; INPUT=$'id\n'"$SECRET"; run --project p-1 --admin-email a@b.co --env-file "$ENVF"
check "default base url is localhost dev" has "$ENVF" "FEEDER_BASE_URL='http://localhost:8080'"
setup; INPUT=""; run "${COMMON[@]}" "$ENVF"
check "missing client id with EOF input fails fast" rc_is 2
setup; run --bogus
check "unknown option is usage error" rc_is 2

# --- round trip: hostile characters survive `set -a; . .env.local` byte-identical
setup
HID="id it's \$HOME \`whoami\` & a/b \\ end"
HSEC="sec ret'\$(echo pwned)\`id\`&/\\ \"q\" \$X"
FEEDER_GOOGLE_CLIENT_ID="$HID" FEEDER_GOOGLE_CLIENT_SECRET="$HSEC" INPUT="" run "${COMMON[@]}" "$ENVF"
check "hostile values exit 0" rc_is 0
RT_ID="$(unset FEEDER_GOOGLE_CLIENT_ID; set -a; . "$ENVF"; printf '%s' "$FEEDER_GOOGLE_CLIENT_ID")"
RT_SEC="$(unset FEEDER_GOOGLE_CLIENT_SECRET; set -a; . "$ENVF"; printf '%s' "$FEEDER_GOOGLE_CLIENT_SECRET")"
check "hostile client id round-trips byte-identical" test "$RT_ID" = "$HID"
check "hostile secret round-trips byte-identical" test "$RT_SEC" = "$HSEC"
check "hostile secret never printed" out_lacks "$HSEC"
check "hostile secret never passed to gcloud" bash -c '! grep -qF -- "$1" "$2"' _ "$HSEC" "$GCLOUD_LOG"

# --- syntax
check "bash -n passes" bash -n "$SCRIPT"

echo "passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ]
