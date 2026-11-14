# shellcheck shell=bash
# check-ui rule 22 (B9-07, A11Y-03, TB-05; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-07.rules.
#   scheme-attr  22  a data-theme selector (nothing sets it: the scheme attribute is data-scheme, set by theme/apply.ts for Light, Dark
#                    and System), or a prefers-color-scheme query in a stylesheet other than web/src/styles.css (a component follows
#                    the chosen Colour mode, never the OS). One violation per selector or query line.
register_rule scheme-attr

rule_scheme_attr() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" -v STYLES="$SRC/styles.css" '
      $1 != "S" { next }
      $3 ~ /data-theme/ {
        print "scheme-attr\t" F "\t" $2 "\t" $3 ": data-theme is never set; key a dark rule on [data-scheme=\047dark\047] (A11Y-03)"
        next
      }
      $3 ~ /^@media/ && $3 ~ /prefers-color-scheme/ && F != STYLES {
        print "scheme-attr\t" F "\t" $2 "\t" $3 ": only styles.css reads the OS scheme; key a dark rule on [data-scheme=\047dark\047] (A11Y-03)"
      }' >>"$VIOL"
  done < <(src_files css)
}
