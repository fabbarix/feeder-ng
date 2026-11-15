# shellcheck shell=bash
# check-ui rule 18 (B9-07, DS-11; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-07.rules.
#   raw-spacing  18  gap, row-gap, column-gap, padding*, margin*, inset* with a px or rem number other than 0 and 1px once var(...) is
#                    taken out, calc() included, outside a token block (:root, html[...]). Use the --space-* tokens (system.md 8); the
#                    2 px micro gap is --space-half. The awk of ui-review-3/ds.md DS-11.
#                    B9-55: a negative length counts too (margin-inline: -8px, 0 -12px, -0.5rem); -1px is the hairline, and a pseudo-element
#                    (::before, ::after) may take a negative inset or margin, because that is how a hit area grows past its control.
register_rule raw-spacing

rule_raw_spacing() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" '
      function tokensel(t) { return (t ~ /^:root$/ || t ~ /^html(\[[^]]*\])*$/) }
      function alltok(list,   n, a, i, t) { n = split(list, a, ","); for (i = 1; i <= n; i++) { t = a[i]; gsub(/^[ \t]+|[ \t]+$/, "", t); if (!tokensel(t)) return 0 } return 1 }
      function allpseudo(list,   n, a, i, t) { n = split(list, a, ","); for (i = 1; i <= n; i++) { t = a[i]; gsub(/^[ \t]+|[ \t]+$/, "", t); if (t !~ /::?(before|after)$/) return 0 } return 1 }
      $1 != "D" { next }
      alltok($3) { next }
      $4 ~ /^(gap|row-gap|column-gap|padding(-[a-z-]+)?|margin(-[a-z-]+)?|inset(-[a-z-]+)?)$/ {
        v = $5; gsub(/var\([^()]*(\([^()]*\))?[^()]*\)/, "", v)
        if (v ~ /(^|[^0-9.a-z-])([2-9]|[1-9][0-9]+|0?\.[0-9]+|1\.[0-9]+)(px|rem)/ || (v ~ /(^|[^0-9.a-z-])-([2-9]|[1-9][0-9]+|0?\.[0-9]+|1\.[0-9]+)(px|rem)/ && !allpseudo($3)))
          print "raw-spacing\t" F "\t" $2 "\t" $4 ": " $5 " on \047" $3 "\047; use a --space-* token (system.md 8; --space-half is the 2 px micro gap)"
      }' >>"$VIOL"
  done < <(src_files css)
}
