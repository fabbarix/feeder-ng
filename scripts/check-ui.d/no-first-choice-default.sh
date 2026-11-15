# shellcheck shell=bash
# check-ui rule 26 (B9-29, SAFE-11; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-29.rules.
#   no-first-choice-default  26  `?? choices[0]` or `?? options[0]` (also `?? props.choices[0]`, `?? options[0]?.value`) in a non-test
#                                .ts or .tsx file under web/src/features: a form never starts on an arbitrary first Ingredient or
#                                option; it starts on a placeholder ("Choose an Ingredient") or on a choice the person made before.
# One violation per matching expression (a line with two is two). Comment lines are not scanned; a name that only ends in "choices"
# or "options" (restChoices) is not a match; web/src/ui is not scanned (a primitive may show its first option for display).
register_rule no-first-choice-default

rule_no_first_choice_default() {
  [ -d "$SRC/features" ] || return 0
  local list
  mapfile -t list < <(src_files tsx ts | grep -E "^$SRC/features/")
  [ "${#list[@]}" -gt 0 ] && [ -n "${list[0]}" ] || return 0
  awk -v RULE=no-first-choice-default -v MSG="a first-choice default (?? choices[0] / ?? options[0]): never start a form on an arbitrary first option; start on a placeholder such as \"Choose an Ingredient\", or on what the person chose before (SAFE-11)" '
    BEGIN { RE = "[?][?][ \t]*(props[.])?(choices|options)\\[0\\]" }
    FNR == 1 { inblk = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    $0 ~ /^[ \t]*\*/ { next }
    {
      s = $0
      while (match(s, RE)) {
        print RULE "\t" FILENAME "\t" FNR "\t" MSG
        s = substr(s, RSTART + RLENGTH)
      }
    }' "${list[@]}" >>"$VIOL"
}
