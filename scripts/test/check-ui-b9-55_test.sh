#!/usr/bin/env bash
# B9-55 (plan section 6 "Done", section 9): the RELEASE STATE of the check-ui guard, read from the real repository.
#   - rules 13-26 (button-variant ... no-first-choice-default) are `[fail]` everywhere, no fail_paths; no-first-choice-default flips too (its one site,
#     settings/lib/courseRemoval.ts, starts on a placeholder);
#   - rules 1-12 are `[fail]` or `[warn; fail in ...]` covering every folder of web/src except, for type-scale and word-break only, features/board and
#     features/cook (main-session ruling of 2026-11-14: Board and Cook Mode keep their literal display sizes);
#   - the real run exits 0 with no violation outside those two folders and rules;
#   - every allow file: each entry has a reason, names a file or selector that still exists; allow-bullets is EMPTY; allow-tones holds only food or loss
#     sites and none of the sites DS-06 says to convert (SecretKeyMissingTile, Couldn't plan tiles, the skipped chips, SyncNotice, YourMenu);
#   - raw-spacing reads negative lengths (fixture raw-spacing-negative): `margin-inline: -8px` fails, a pseudo-element hit area (`::after { inset: -6px }`) does not.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }

OUT="$(CHECK_UI_OUT="$TMP/out.txt" bash "$ROOT/scripts/check-ui.sh" --root "$ROOT" 2>&1)"; RC=$?
[ "$RC" -eq 0 ] && ok || bad "check-ui exits $RC on the repository"
RES="$(OUT="$OUT" ROOT="$ROOT" TXT="$TMP/out.txt" node -e '
const fs=require("fs"),path=require("path");const out=process.env.OUT.split("\n");const root=process.env.ROOT
const r13=["button-variant","close-button","sheet-cancel","bullet-notice","raw-radius","raw-spacing","media-width","status-tone","focus-ring","scheme-attr","danger-sheet","alert-in-form","no-history-back","no-first-choice-default"]
const EXEMPT={"type-scale":1,"word-break":1}
const dirs=["web/src/ui","web/src/app",...fs.readdirSync(path.join(root,"web/src/features")).filter(d=>fs.statSync(path.join(root,"web/src/features",d)).isDirectory()).map(d=>"web/src/features/"+d)]
const problems=[];const seen=new Set()
for(const l of out){const m=/^  (\S+)\s+\d+ violations\s+\[(.*)\]$/.exec(l);if(!m)continue;const [,name,mode]=m;seen.add(name)
 if(r13.includes(name)){if(mode!=="fail")problems.push(name+" must be [fail] everywhere, is ["+mode.slice(0,40)+"]");continue}
 if(mode==="fail")continue
 const paths=(/^warn; fail in (.*)$/.exec(mode)||[,""])[1].split(/\s+/).filter(Boolean)
 const unc=dirs.filter(d=>!paths.some(p=>d===p||d.startsWith(p+"/")||p.startsWith(d+"/")&&false))
 const allowed=EXEMPT[name]?["web/src/features/board","web/src/features/cook"]:[]
 const extra=unc.filter(d=>!allowed.includes(d));if(extra.length)problems.push(name+" does not fail in "+extra.join(", "))}
for(const n of r13)if(!seen.has(n))problems.push("rule "+n+" is not reported")
const txt=fs.existsSync(process.env.TXT)?fs.readFileSync(process.env.TXT,"utf8").split("\n").filter(Boolean):[]
for(const l of txt){const [rule,file]=l.split("\t");if(!(EXEMPT[rule]&&/^web\/src\/features\/(board|cook)\//.test(file)))problems.push("violation: "+rule+" "+file)}
console.log(problems.join("\n"))')"
[ -z "$RES" ] && ok || while IFS= read -r l; do bad "release modes: $l"; done <<<"$RES"

# allow files
for f in "$ROOT"/scripts/check-ui.allow-*; do
  n=$(basename "$f")
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue;; esac
    case "$line" in *'#'*) r="${line#*#}"; [ -n "$(echo "$r" | tr -d ' ')" ] && ok || bad "$n: an entry has an empty reason: $line";; *) bad "$n: an entry has no reason: $line";; esac
    p="$(echo "${line%%#*}" | awk '{print $1}')"
    case "$p" in web/*) [ -e "$ROOT/$p" ] && ok || bad "$n: $p no longer exists (dead entry)";; esac
  done <"$f"
done
[ -z "$(grep -vE '^\s*(#|$)' "$ROOT/scripts/check-ui.allow-bullets")" ] && ok || bad "check-ui.allow-bullets must be empty at release ($(grep -cvE '^\s*(#|$)' "$ROOT/scripts/check-ui.allow-bullets") entries: convert to DetailList/ListRow)"
for p in recipe-assistant/components/SecretKeyMissingTile.tsx plan/components/CouldntPlanExclusionSummary.tsx plan/components/CouldntPlanExclusionTile.tsx plan/lib/couldntGroups.ts plan/lib/chips.ts plan/lib/rowChips.ts ui/SyncNotice.tsx app/YourMenu.tsx; do
  grep -qE "^[^#]*/$p\b" "$ROOT/scripts/check-ui.allow-tones" && bad "allow-tones lists $p: DS-06 converts it to warn, info or neutral" || ok
done

# raw-spacing, negative lengths
FIX="$HERE/fixtures/check-ui/raw-spacing-negative"
printf 'raw-spacing=fail\n' >"$TMP/rules"
for kind in fail pass; do
  CHECK_UI_OUT="$TMP/o-$kind.txt" bash "$ROOT/scripts/check-ui.sh" --root "$FIX/$kind" --rules "$TMP/rules" >"$TMP/log-$kind" 2>&1; rc=$?
  n=$(sed -nE 's/^ +raw-spacing +([0-9]+) violations.*/\1/p' "$TMP/log-$kind")
  if [ "$kind" = fail ]; then [ "$rc" -eq 1 ] && [ "$n" = 4 ] && ok || bad "raw-spacing fixture fail: want exit 1 and 4 violations (negative px, rem, calc, shorthand), got rc=$rc n=$n"
  else [ "$rc" -eq 0 ] && [ "${n:-0}" = 0 ] && ok || bad "raw-spacing fixture pass: want exit 0 and 0 violations, got rc=$rc n=$n"; fi
done
printf 'check-ui-b9-55_test: %d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
