# shellcheck shell=bash
# check-ui rule 16 (B9-01, DS-12; plan section 9), a drop-in sourced by scripts/check-ui.sh (B9-03). Mode: scripts/check-ui.rules.d/b9-01.rules.
#   bullet-notice  16  a hand-written <ul>/<li> in a file that renders a Tile, Notice, Toast or Dialog (DS-12 R-E: use DetailList)
# bullet-notice has a file-level allowlist, scripts/check-ui.allow-bullets (exact paths, each with its owner and reason).
ALLOW_BULLETS="$ALLOW_DIR/check-ui.allow-bullets"
register_rule bullet-notice

# DS-12 R-E: structured items are rows. One violation per file that writes <ul>/<li> by hand and renders a Tile, a Notice,
# a Toast or a Dialog (outside ui/DetailList). scripts/check-ui.allow-bullets lists the files whose lists the owning theme
# package converts (`<path>   # owner and reason`, like check-ui.allow-colours); an entry without a reason is ignored.
rule_bullet_notice() {
  local f line allowed=()
  if [ -f "$ALLOW_BULLETS" ]; then
    mapfile -t allowed < <(awk '{ h = index($0, "#"); if (!h) next; p = substr($0, 1, h - 1); r = substr($0, h + 1)
      gsub(/^[ \t]+|[ \t]+$/, "", p); gsub(/^[ \t]+|[ \t]+$/, "", r); if (p != "" && r != "") print p }' "$ALLOW_BULLETS")
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    local a skip=0
    for a in "${allowed[@]}"; do [ "$f" = "$a" ] && skip=1; done
    [ "$skip" = 1 ] && continue
    grep -Eq '<(ul|li)([ \t>]|$)' "$f" || continue
    grep -Eq '<Tile([ \t>]|$)|<[A-Za-z]*Notice([ \t>/]|$)|useToast\(|<Toast([ \t>]|$)|<(Confirm)?Dialog([ \t>]|$)' "$f" || continue
    line="$(grep -nE '<(ul|li)([ \t>]|$)' "$f" | head -1 | cut -d: -f1)"
    viol bullet-notice "$f" "$line" "a hand-written list in a Tile, Notice, Toast or Dialog file; use DetailList for items with a key, a state and detail (DS-12 R-E)"
  done < <(src_files tsx | grep -v "^$SRC/ui/DetailList\.tsx$")
}
