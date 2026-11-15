# shellcheck shell=bash
# check-ui rule 23 (B9-18, SAFE R1; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-18.rules.
#   danger-sheet  23  a <Dialog> or <BottomSheet> with tone="danger" or icon="delete": a danger confirm built outside ConfirmDialog
register_rule danger-sheet

# One violation per offending <Dialog>/<BottomSheet> element, on the line of its opening tag (which may span lines). The opening
# tag ends at the first ">" outside braces. The primitives (ui/ConfirmDialog, ui/Dialog, ui/BottomSheet) and the Gallery are exempt.
# Comments do not count.
rule_danger_sheet() {
  local list
  mapfile -t list < <(src_files tsx | grep -vE "^$SRC/ui/(ConfirmDialog|Dialog|BottomSheet|Gallery[^/]*)\.tsx$")
  [ "${#list[@]}" -gt 0 ] && [ -n "${list[0]}" ] || return 0
  awk -v RULE=danger-sheet -v MSG="a danger confirm built outside ConfirmDialog; use useConfirm() or <ConfirmDialog tone=\"danger\"> (safe button focused, outline Cancel, rows, no Close) (SAFE R1)" '
    FNR == 1 { inblk = 0; open = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    {
      line = $0
      gsub(/\{\/\*.*\*\/\}/, "", line)
      while (1) {
        if (!open) {
          if (!match(line, /<(BottomSheet|Dialog)([ \t\/>]|$)/)) break
          open = 1; start = FNR; depth = 0; tag = ""
          line = substr(line, RSTART + 1)
        }
        # scan the opening tag up to its closing ">" outside braces
        n = length(line); done = 0
        for (i = 1; i <= n; i++) {
          c = substr(line, i, 1)
          if (c == "{") depth++
          else if (c == "}") depth--
          else if (c == ">" && depth == 0) { done = 1; break }
        }
        tag = tag " " (done ? substr(line, 1, i) : line)
        if (!done) break
        if (tag ~ /tone=("danger"|\{"danger"\}|\x27danger\x27)/ || tag ~ /icon=("delete"|\{"delete"\}|\x27delete\x27)/) print RULE "\t" FILENAME "\t" start "\t" MSG
        open = 0
        line = substr(line, i + 1)
      }
    }' "${list[@]}" >>"$VIOL"
}
