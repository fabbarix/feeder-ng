# shellcheck shell=bash
# check-ui rule 25 (B9-31, SAFE-06; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-31.rules.
#   no-history-back  25  navigate(-1), history.back() or history.go(-1) used to leave a screen. After a reload, a PWA launch or a shared
#                        link there is no in-app history, so a Cancel built on it closes Feeder (and it bypasses the leave guard).
# One violation per call. Comments do not count. A line that also reads `location.key` only goes back when the app has history to go
# back to (features/plan/hooks/useMarkSlotRoute.ts) and is allowed.
register_rule no-history-back

rule_no_history_back() {
  local files=()
  mapfile -t files < <(src_files ts tsx)
  [ "${#files[@]}" -gt 0 ] || return 0
  [ -n "${files[0]}" ] || return 0
  awk -v RULE=no-history-back -v MSG="leaves by history; go to a known route with replace instead (navigate(editorExitRoute(id), { replace: true })), SAFE-06" '
    FNR == 1 { inblk = 0 }
    {
      line = $0
      if (inblk) { e = index(line, "*/"); if (!e) next; line = substr(line, e + 2); inblk = 0 }
      # drop /* ... */ on the line (JSX comments included), then an open block comment, then a // comment
      while ((s = index(line, "/*")) > 0) {
        rest = substr(line, s + 2); e = index(rest, "*/")
        if (e) line = substr(line, 1, s - 1) substr(rest, e + 2)
        else { line = substr(line, 1, s - 1); inblk = 1; break }
      }
      if ((s = index(line, "//")) > 0) line = substr(line, 1, s - 1)
      if (index(line, "location.key")) next
      while (match(line, /navigate\([ \t]*-1[ \t]*\)|history\.back\([ \t]*\)|history\.go\([ \t]*-1[ \t]*\)/)) {
        print RULE "\t" FILENAME "\t" FNR "\t" MSG
        line = substr(line, RSTART + RLENGTH)
      }
    }' "${files[@]}" >>"$VIOL"
}
