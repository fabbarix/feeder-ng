# shellcheck shell=bash
# check-ui rule 24 (B9-16, SAFE-04; plan section 9), a drop-in sourced by scripts/check-ui.sh (B9-03). Mode: scripts/check-ui.rules.d/b9-16.rules.
#   alert-in-form  24  role="alert" in a file that renders a <form>, other than ui/fields/FormError.tsx (SAFE-04 R4: a field error is
#                      not an alert, focusFirstInvalid moves focus and the field reads its error through aria-describedby; a server error
#                      with no field is <FormError>)
register_rule alert-in-form

# One violation per role="alert" (role='alert', role={"alert"}, role: 'alert') in a .tsx file that has a <form (or a <Form) element,
# comments left out. FormError itself is the one place the alert lives. A banner, a toast or an ErrorState with no form is fine.
rule_alert_in_form() {
  local list
  mapfile -t list < <(src_files tsx | grep -vE "^$SRC/ui/fields/FormError\.tsx$")
  [ "${#list[@]}" -gt 0 ] && [ -n "${list[0]}" ] || return 0
  awk -v RULE=alert-in-form -v MSG="a role=\"alert\" in a form; field errors are not alerts (focusFirstInvalid), a server error with no field is <FormError> (SAFE-04)" '
    function flush(   i) { if (hasform) for (i = 1; i <= n; i++) print RULE "\t" FILE "\t" lines[i] "\t" MSG; n = 0; hasform = 0 }
    FNR == 1 { flush(); FILE = FILENAME; inblk = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    $0 ~ /^[ \t]*\*/ { next }
    {
      if ($0 ~ /<[Ff]orm([ \t>]|$)/) hasform = 1
      if ($0 ~ /role=("alert"|\047alert\047|\{["\047]alert["\047]\})|role:[ \t]*["\047]alert["\047]/) lines[++n] = FNR
    }
    END { flush() }' "${list[@]}" >>"$VIOL"
}
