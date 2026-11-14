# shellcheck shell=bash
# check-ui rule 13 (B9-01, DS-12; plan section 9), a drop-in sourced by scripts/check-ui.sh (B9-03). Mode: scripts/check-ui.rules.d/b9-01.rules.
#   button-variant  13  variant="tertiary" | "danger-tertiary" | "accent-secondary" (DS-12 R-A: secondary, danger-secondary or link)
register_rule button-variant

# DS-12 R-A: no tertiary action. One violation per offending variant attribute (a ternary counts each removed literal).
rule_button_variant() {
  local list
  mapfile -t list < <(src_files tsx ts)
  [ "${#list[@]}" -gt 0 ] && [ -n "${list[0]}" ] || return 0
  awk -v RULE=button-variant -v MSG="removed Button variant; use secondary, danger-secondary, or link inside running text (DS-12 R-A)" '
    FNR == 1 { inblk = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    {
      line = $0
      while (match(line, /variant=("(tertiary|danger-tertiary|accent-secondary)"|\{[^}]*\})/)) {
        attr = substr(line, RSTART, RLENGTH)
        line = substr(line, RSTART + RLENGTH)
        n = gsub(/["\047](tertiary|danger-tertiary|accent-secondary)["\047]/, "", attr)
        for (i = 0; i < n; i++) print RULE "\t" FILENAME "\t" FNR "\t" MSG
      }
    }' "${list[@]}" >>"$VIOL"
}
