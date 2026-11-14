# shellcheck shell=bash
# check-ui rule 17 (B9-07, DS-11; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-07.rules.
#   raw-radius  17  a border-radius (or a corner radius) with a px or rem number other than 0 once var(...) is taken out, outside a
#                   token block (:root, html[...]); 50% (a circle) stays allowed. Use the --radius-* tokens (system.md 8).
register_rule raw-radius

rule_raw_radius() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" '
      function tokensel(t) { return (t ~ /^:root$/ || t ~ /^html(\[[^]]*\])*$/) }
      function alltok(list,   n, a, i, t) { n = split(list, a, ","); for (i = 1; i <= n; i++) { t = a[i]; gsub(/^[ \t]+|[ \t]+$/, "", t); if (!tokensel(t)) return 0 } return 1 }
      $1 != "D" { next }
      alltok($3) { next }
      $4 ~ /^border(-[a-z]+-[a-z]+)?-radius$/ {
        v = $5; gsub(/var\([^()]*(\([^()]*\))?[^()]*\)/, "", v)
        if (v ~ /(^|[^0-9.a-z-])([1-9][0-9]*(\.[0-9]+)?|0?\.[0-9]+)(px|rem)/)
          print "raw-radius\t" F "\t" $2 "\t" $4 ": " $5 " on \047" $3 "\047; use a --radius-* token (system.md 8), 0 or 50%"
      }' >>"$VIOL"
  done < <(src_files css)
}
