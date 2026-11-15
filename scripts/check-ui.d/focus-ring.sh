# shellcheck shell=bash
# check-ui rule 21 (B9-07, A11Y-02; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-07.rules.
#   focus-ring  21  a box-shadow: var(--focus-ring) anywhere (the ring is an outline, so forced colours keep it), or outline: none in a
#                   :focus-visible rule whose last compound is not on the allow-list (.ui-field__input, .search-field__input,
#                   .ui-field__textarea, .time-field__segment, .segmented__option: a text entry whose frame rings, an option whose
#                   track rings; B9-34: .line-row__tick, the Shop tick whose visible 24 px circle takes the ring as its border, R-C+).
#                   One violation per offending declaration.
register_rule focus-ring

rule_focus_ring() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" '
      function lastc(t,   n, a) { gsub(/[ \t]*[>+~][ \t]*/, " ", t); gsub(/[ \t]+$/, "", t); n = split(t, a, /[ \t]+/); return a[n] }
      function allowed(t,   l) {
        l = lastc(t); gsub(/:[a-z-]+(\([^)]*\))?/, "", l)
        return (l == ".ui-field__input" || l == ".search-field__input" || l == ".ui-field__textarea" || l == ".time-field__segment" || l == ".segmented__option" || l == ".line-row__tick")
      }
      $1 != "D" { next }
      $4 == "box-shadow" && $5 ~ /var\(--focus-ring\)/ {
        print "focus-ring\t" F "\t" $2 "\tbox-shadow: var(--focus-ring) on \047" $3 "\047; the ring is an outline in --focus-ring-width / --focus-ring-color (A11Y-02)"
        next
      }
      $4 == "outline" && ($5 == "none" || $5 == "0") && $3 ~ /:focus-visible/ {
        k = split($3, parts, ",")
        for (i = 1; i <= k; i++) {
          t = parts[i]; gsub(/^[ \t]+|[ \t]+$/, "", t)
          if (t ~ /:focus-visible/ && !allowed(t)) {
            print "focus-ring\t" F "\t" $2 "\toutline: none on \047" $3 "\047 hides the ring; keep the global --focus-ring-* outline, or move it to the frame (A11Y-02)"
            break
          }
        }
      }' >>"$VIOL"
  done < <(src_files css)
}
