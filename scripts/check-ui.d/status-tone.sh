# shellcheck shell=bash
# check-ui rule 20 (B9-17, DS-06, decision DS 3, VC9; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-17.rules.
#   status-tone  20  a status or tone attribute or property set to 'spoil' or 'danger' (status="spoil", status={'danger'},
#                    status: 'spoil', tone="danger") in a non-test .ts or .tsx file under web/src, outside scripts/check-ui.allow-tones.
# spoil means food going off and danger means loss or destruction (system.md 2). A rule or a setting that needs a decision is warn, a
# question or a time to know is info (Advance Steps, overdue ones included), a record is neutral. One violation per setting found (a
# line that sets two tones, `{ status: 'spoil' } : { tone: 'danger' }`, is two). Comment lines are not scanned; a type union
# ('spoil' | 'danger') and an icon-map key (danger: {...}) are not settings.
# scripts/check-ui.allow-tones lists the files that really are food or destruction: `<exact path>   # reason`; an entry without a
# reason is ignored.
ALLOW_TONES="$ALLOW_DIR/check-ui.allow-tones"
register_rule status-tone

rule_status_tone() {
  local files=() allowed=() f a skip
  if [ -f "$ALLOW_TONES" ]; then
    mapfile -t allowed < <(awk '{ h = index($0, "#"); if (!h) next; p = substr($0, 1, h - 1); r = substr($0, h + 1)
      gsub(/^[ \t]+|[ \t]+$/, "", p); gsub(/^[ \t]+|[ \t]+$/, "", r); if (p != "" && r != "") print p }' "$ALLOW_TONES")
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    skip=0
    for a in "${allowed[@]}"; do [ "$f" = "$a" ] && skip=1; done
    [ "$skip" = 1 ] || files+=("$f")
  done < <(src_files tsx ts)
  [ "${#files[@]}" -gt 0 ] || return 0
  awk '
    BEGIN {
      # status="spoil", status={'"'"'danger'"'"'}, status={"spoil"}, status: '"'"'danger'"'"', tone="spoil" ...
      RE = "(status|tone)[ \t]*(=[ \t]*\\{?[ \t]*|:[ \t]*)[\"\047`](spoil|danger)[\"\047`]"
      MSG = "a spoil or danger tone: spoil is food going off and danger is loss; use warn (a decision), info (a question or a time to know) or a neutral state chip (a record), or list the file in scripts/check-ui.allow-tones with its reason (DS-06, VC9)"
    }
    FNR == 1 { inblk = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    $0 ~ /^[ \t]*\*/ { next }
    {
      s = $0
      while (match(s, RE)) {
        print "status-tone\t" FILENAME "\t" FNR "\t" MSG
        s = substr(s, RSTART + RLENGTH)
      }
    }' "${files[@]}" >>"$VIOL"
}
