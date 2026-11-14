# shellcheck shell=bash
# check-ui rule 19 (B9-07, DS-09, ADR 0027; plan section 9), a drop-in sourced by scripts/check-ui.sh. Mode: scripts/check-ui.rules.d/b9-07.rules.
#   media-width  19  a width @media that is not (min-width: Xem) or (width < Xem) with X in the breakpoint table
#                    {23.5, 37.5, 48, 64, 80, 90} (web/src/ui/lib/breakpoints.ts); a px width in an @container (a component-fit
#                    threshold is in rem); a useMediaQuery('...width...') call outside web/src/ui/lib/ (use useBreakpoint / useNarrow).
#                    One violation per offending @media / @container line or call.
register_rule media-width

rule_media_width() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" '
      $1 != "S" { next }
      $3 ~ /^@media/ {
        s = $3; bad = 0
        while (match(s, /\([ \t]*(min-width|max-width|width)[ \t]*(:|<=|>=|<|>)[^)]*\)/)) {
          c = substr(s, RSTART + 1, RLENGTH - 2); s = substr(s, RSTART + RLENGTH)
          gsub(/[ \t]+/, "", c)
          if (c !~ /^(min-width:|width<)(23\.5|37\.5|48|64|80|90)em$/) bad = 1
        }
        if (bad) print "media-width\t" F "\t" $2 "\t" $3 ": a width query is (min-width: Xem) or (width < Xem) with X in the breakpoint table (23.5, 37.5, 48, 64, 80, 90; ui/lib/breakpoints.ts)"
        next
      }
      $3 ~ /^@container/ && $3 ~ /[0-9]px/ {
        print "media-width\t" F "\t" $2 "\t" $3 ": a container query width is in rem (a component-fit threshold, DS-09), never px"
      }' >>"$VIOL"
  done < <(src_files css)
  src_files ts tsx | grep -v "^$SRC/ui/lib/" | code_match media-width \
    "useMediaQuery with a width; use useBreakpoint(name) or useNarrow() (ui/lib/breakpoints.ts, the em table)" \
    'useMediaQuery\([ \t]*[`"\047][^`"\047]*width'
}
