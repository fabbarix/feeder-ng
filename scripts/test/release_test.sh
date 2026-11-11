#!/usr/bin/env bash
# Release 1.0.0-beta.1: CHANGELOG, prerelease scheme and upgrade notes in the deploy guide.
# Contract: docs/dev/design/rel1-deploy.md.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$HERE/../.."
PASS=0; FAIL=0
ok()  { PASS=$((PASS + 1)); }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL: %s\n' "$1"; }
D="$ROOT/docs/dev/deploy.md"
C="$ROOT/CHANGELOG.md"
CH="$ROOT/deploy/helm/feeder"

# --- CHANGELOG.md (Keep a Changelog layout) ---
if [ ! -f "$C" ]; then bad "CHANGELOG.md is missing at the repository root"; else
  grep -Eq '^## \[1\.0\.0-beta\.1\] - [0-9]{4}-[0-9]{2}-[0-9]{2}' "$C" && ok || bad "CHANGELOG.md needs a '## [1.0.0-beta.1] - YYYY-MM-DD' heading"
  grep -Eq '^## \[?Unreleased' "$C" && ok || bad "CHANGELOG.md needs an Unreleased section above the release"
  grep -Eq '^## \[1\.0\.0-dev\]' "$C" && ok || bad "CHANGELOG.md needs a 1.0.0-dev entry (the baseline)"
  for t in 'Recipe Assistant' 'Access Request' 'Reheat' 'ImagePicker|image picker|Ingredient pictures' 'Meal Slot' 'Couldn.t plan' 'streak' 'FEEDER_SECRET_KEY' 'FEEDER_TRUST_PROXY' 'THIRD_PARTY_NOTICES'; do
    grep -Eqi -- "$t" "$C" && ok || bad "CHANGELOG.md must mention: $t"
  done
  grep -Eq '^### (Added|Changed)' "$C" && ok || bad "CHANGELOG.md needs Added/Changed subsections"
  grep -Eqi 'upgrad' "$C" && grep -q '1.0.0-dev' "$C" && ok || bad "CHANGELOG.md must carry the upgrade note from 1.0.0-dev"
  grep -Eq '^### Fixed$' "$C" && ok || bad "CHANGELOG.md needs the standard '### Fixed' heading"
  grep -Fq -- '--reset-then-reuse-values' "$C" && ok || bad "CHANGELOG.md upgrade step must name --reset-then-reuse-values"
  grep -Eqi "any User[^.]*approve[^.]*deny" "$C" && ok || bad "CHANGELOG.md must say any User may approve or deny an Access Request"
  grep -Eq 'Member has a Photo' "$C" && grep -Eq 'Ingredient has a Picture' "$C" && ok || bad "CHANGELOG.md must say a Member has a Photo and an Ingredient has a Picture"
  # GLOSSARY: no word the glossary says to avoid may appear in the user-facing prose of the changelog. Before matching, strip
  # fenced and inline code, link targets, the standard Keep a Changelog headings, and any avoided word that is itself a
  # GLOSSARY headword (e.g. Member is avoided for User but is a term of its own).
  python3 "$ROOT/scripts/changelog-avoid.py" "$ROOT/GLOSSARY.md" "$C" && ok || bad "CHANGELOG.md uses a term listed under _Avoid_ in GLOSSARY.md"
  # "wait" is banned only as a name for a Passive Step (GLOSSARY: _Avoid_ lists "wait step" and "a wait", with a note); the plain
  # verb is fine. Same guard, fixture glossary and changelogs.
  W="$(mktemp -d)"
  sed -n '/^\*\*Passive Step\*\*/,/^$/p' "$ROOT/GLOSSARY.md" | grep -Eq '^_Avoid_:.*wait step' && ok || bad "GLOSSARY Passive Step must list 'wait step' under _Avoid_"
  sed -n '/^\*\*Passive Step\*\*/,/^$/p' "$ROOT/GLOSSARY.md" | grep -Eq '^_Avoid_:.*a wait' && ok || bad "GLOSSARY Passive Step must list 'a wait' under _Avoid_"
  sed -n '/^\*\*Passive Step\*\*/,/^$/p' "$ROOT/GLOSSARY.md" | grep -Eq '^_Avoid_:.*(,|:) *wait *(,|$)' && bad "GLOSSARY must not ban bare 'wait' (ordinary verb)" || ok
  sed -n '/^\*\*Passive Step\*\*/,/^$/p' "$ROOT/GLOSSARY.md" | grep -Eqi '^_Note_:.*ordinary verb' && ok || bad "GLOSSARY Passive Step needs a _Note_ saying 'wait' is fine as an ordinary verb"
  printf '**Passive Step**:\nA step.\n_Avoid_: Background step, wait step, a wait\n_Note_: wait is fine as an ordinary verb.\n' >"$W/G.md"
  printf '## [1.0.0] - 2026-01-01\n\nSave is possible once every Photo is stored, so wait for it, or keep waiting; one waits, two wait.\n' >"$W/ok.md"
  python3 "$ROOT/scripts/changelog-avoid.py" "$W/G.md" "$W/ok.md" >/dev/null && ok || bad "changelog guard must allow 'wait', 'waits', 'waiting' as plain verbs"
  for t in 'Add a wait step to the Recipe.' 'The Recipe has a wait before serving.' 'Two wait steps run.' 'A Background step runs.'; do
    printf '## [1.0.0] - 2026-01-01\n\n%s\n' "$t" >"$W/bad.md"
    python3 "$ROOT/scripts/changelog-avoid.py" "$W/G.md" "$W/bad.md" >/dev/null && bad "changelog guard must flag: $t" || ok
  done
  rm -rf "$W"
fi

# --- deploy.md: prerelease scheme and upgrade note ---
grep -Eq -- '-beta\.N' "$D" && ok || bad "deploy.md must document the -beta.N scheme"
grep -Eq -- '-rc\.N' "$D" && ok || bad "deploy.md must document the -rc.N scheme"
grep -Eq -- 'v1\.0\.0-beta\.1' "$D" && ok || bad "deploy.md must name v1.0.0-beta.1 (image and chart)"
grep -Eq -- 'git tag v1\.0\.0-beta\.1 && git push origin v1\.0\.0-beta\.1' "$D" && ok || bad "deploy.md must show git tag v1.0.0-beta.1 && git push origin v1.0.0-beta.1"
grep -Eq -- '\| *`1\.0\.0-beta\.1`' "$D" && ok || bad "deploy.md image tag table must list 1.0.0-beta.1"
grep -Eqi 'beta[^.]*(before|precede)[^.]*rc|alpha|order' "$D" && ok || bad "deploy.md must say how the prerelease tags order (dev < beta < rc < stable)"
grep -Eqi 'never[^.]*`?1\.0`?[^.]*`?1`?|prerelease[^.]*(no|never|not)[^.]*(floating|latest|`1\.0`)' "$D" && ok || bad "deploy.md must say prereleases get no latest, 1.0 or 1 tag"
grep -Eqi 'upgrad[^.]*1\.0\.0-dev|1\.0\.0-dev[^.]*upgrad' "$D" && ok || bad "deploy.md must have an upgrade note from 1.0.0-dev"
grep -Eqi 'helm (upgrade|install)[^`]*--version 1\.0\.0-beta\.1' "$D" && ok || bad "deploy.md must show a helm command with --version 1.0.0-beta.1"
grep -Eqi 'prerelease|pre-release' "$D" && grep -Eqi 'helm[^.]*(--devel|explicit[^.]*--version)|--version[^.]*(required|explicit)|--devel' "$D" && ok || bad "deploy.md must say prerelease charts need an explicit --version (or --devel)"
grep -Eqi 'reuse-values[^.]*(new|added)[^.]*(value|setting|default)|secretKey[^.]*reuse-values|reuse-values[^.]*secretKey' "$D" && ok || bad "deploy.md must warn that --reuse-values keeps old values, so a new chart's secretKey default needs --reset-then-reuse-values or --set"
# Not a problem to say 'latest' in the table, but the beta must not claim it.
if grep -E '\| *`latest`' "$D" | grep -q 'beta'; then bad "deploy.md must not tie latest to a beta"; else ok; fi

# --- chart docs show the prerelease install ---
grep -Eq -- '--version 1\.0\.0-beta\.1' "$CH/README.md" && ok || bad "chart README must show --version 1.0.0-beta.1"
grep -Eq -- '--version 1\.0\.0-beta\.1' "$CH/templates/NOTES.txt" "$ROOT/docs/dev/deploy.md" >/dev/null && ok || bad "deploy.md must pin 1.0.0-beta.1 in the Kubernetes install"

printf '%d passed, %d failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
