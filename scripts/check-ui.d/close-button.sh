# shellcheck shell=bash
# check-ui rule 14 (B9-01, DS-12; plan section 9), a drop-in sourced by scripts/check-ui.sh (B9-03). Mode: scripts/check-ui.rules.d/b9-01.rules.
#   close-button  14  <IconButton icon="close"> outside ui/CloseButton, ui/Toast and ui/Chip (DS-12 R-B: use <CloseButton>)
register_rule close-button

# DS-12 R-B: one Close. An <IconButton ... icon="close"> element (one or more lines) outside CloseButton, Toast and Chip.
rule_close_button() {
  local list
  mapfile -t list < <(src_files tsx | grep -vE "^$SRC/ui/(CloseButton|Toast|Chip)\.tsx$")
  [ "${#list[@]}" -gt 0 ] && [ -n "${list[0]}" ] || return 0
  awk -v RULE=close-button -v MSG="an IconButton with the close icon; use <CloseButton> (DS-12 R-B)" '
    FNR == 1 { inblk = 0; el = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    {
      line = $0
      while (line != "") {
        if (!el) {
          p = match(line, /<IconButton([^A-Za-z0-9_]|$)/)
          if (!p) break
          el = 1; hit = 0; start = FNR
          line = substr(line, RSTART + 11)
        }
        e = index(line, ">")
        seg = e ? substr(line, 1, e) : line
        if (seg ~ /icon=("close"|\{["\047]close["\047]\})/) hit = 1
        if (!e) break
        if (hit) print RULE "\t" FILENAME "\t" start "\t" MSG
        el = 0
        line = substr(line, e + 1)
      }
    }' "${list[@]}" >>"$VIOL"
}
