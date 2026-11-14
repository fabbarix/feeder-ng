# shellcheck shell=bash
# check-ui rule 15 (B9-01, DS-12; plan section 9), a drop-in sourced by scripts/check-ui.sh (B9-03). Mode: scripts/check-ui.rules.d/b9-01.rules.
#   sheet-cancel  15  a <BottomSheet> or <Dialog> passing its own {…strings.cancel} Button (DS-12 R-B: use onCancel)
register_rule sheet-cancel

# DS-12 R-B: a sheet or dialog takes onCancel; it never passes its own Cancel button. One violation per <BottomSheet>/<Dialog>
# element whose span (to its closing tag, or to the self-closing "/>" at the opener's indent) shows a {…strings.cancel} label.
rule_sheet_cancel() {
  local list
  mapfile -t list < <(src_files tsx | grep -vE "^$SRC/ui/(BottomSheet|Dialog)\.tsx$")
  [ "${#list[@]}" -gt 0 ] && [ -n "${list[0]}" ] || return 0
  awk -v RULE=sheet-cancel -v MSG="a sheet or dialog with its own Cancel button; pass onCancel (and cancelLabel) instead (DS-12 R-B)" '
    function indent(s) { match(s, /^[ \t]*/); return RLENGTH }
    FNR == 1 { inblk = 0; open = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    # cancelLabel={…cancel} is how a sheet names its own Cancel: not a violation
    { gsub(/cancelLabel=\{[^}]*\}/, "") }
    {
      if (!open && match($0, /<(BottomSheet|Dialog)([ \t>]|$)/)) {
        open = 1; hit = 0; start = FNR; ind = indent($0)
        tag = substr($0, RSTART + 1, RLENGTH - 1); sub(/[ \t>]+$/, "", tag)
        rest = substr($0, RSTART)
        if (rest ~ /\{[A-Za-z_][A-Za-z0-9_.]*\.cancel\}/) hit = 1
        # a one-line element closes on the same line
        if (rest ~ /\/>[ \t]*\)?[ \t]*$/ || index(rest, "</" tag ">")) { if (hit) print RULE "\t" FILENAME "\t" start "\t" MSG; open = 0 }
        next
      }
      if (!open) next
      if ($0 ~ /\{[A-Za-z_][A-Za-z0-9_.]*\.cancel\}/) hit = 1
      if (index($0, "</" tag ">") || (indent($0) == ind && $0 ~ /^[ \t]*\/>/)) {
        if (hit) print RULE "\t" FILENAME "\t" start "\t" MSG
        open = 0
      }
    }' "${list[@]}" >>"$VIOL"
}
