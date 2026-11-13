#!/usr/bin/env bash
# UI guards (docs/design/ui-fix-plan.md section 7, WP0). Grep/awk based, no dependencies.
#
#   scripts/check-ui.sh [--root DIR] [--rules FILE] [--verbose]
#
# Rules (names are the keys in scripts/check-ui.rules, which holds each rule's mode):
#   native-ui        1  no <select>, window.alert/confirm/prompt, native input types outside web/src/ui
#   phosphor         2  @phosphor-icons/react only in web/src/ui/icons.ts, only via /dist/csr/<Name>
#   colour-literals  3  no hex/rgb/hsl/oklch literals in feature/ui/app CSS and in .tsx (use var(--...))
#   class-hooks      4  every className token used in .tsx has a CSS rule (or is in the allowlist)
#   sizing           5  no min-height on .tile variants; no px font sizes (use the type tokens)
#   glossary         6  GLOSSARY.md _Avoid_ words in strings.ts (or in the allowlist)
#   native-search    7  no <input type="search"> outside web/src/ui (use the SearchField primitive)
#   back-link        8  no BackLink, no <Link>/<a> reading "Back to ...", no <IconButton icon="back"> that navigates (use Breadcrumbs)
#   image-input      9  no own image input (IM2): no accept= with an image type or extension, no capture=, no '/api/images' upload URL
#                       outside web/src/ui/ImagePicker (use <ImagePicker>); accept=".json" and display URLs like `/api/images/${id}` are fine,
#                       and so is the capture prop of the shared <ImageFileInput> (capture={onPhone})
#   type-scale      10  a font-size / font that is not a --text-* token (or inherit), outside a token block (:root, html[...]) (system.md 1)
#   opacity-muting  11  opacity between 0.5 and 0.95 on a selector that is not a disabled state: mute text with --color-muted (system.md 2)
#   word-break      12  hyphens: auto, overflow-wrap / word-wrap anywhere|break-word, word-break break-all|break-word, unless the selector
#                       names a one-token value (email, url, link, barcode, code) (system.md 3)
#
# colour-literals has a file-level allowlist, scripts/check-ui.allow-colours: `<path substring>   # reason`,
# one line per file that holds a third party's brand colours (never a feature screen or a primitive). An entry
# without a reason is ignored; an entry matches every colour-literals violation in each file it is a substring of.
#
# Output: counts per rule and the first few violations; every violation goes to
# <root>/build/check-ui.txt (override with CHECK_UI_OUT). Exit 1 only if a rule in
# `fail` mode (or a violation under that rule's fail_paths) has violations.
# Test files (*.test.*, test-utils.*, web/src/test/) are never scanned.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RULES_FILE="${CHECK_UI_RULES:-$SCRIPT_DIR/check-ui.rules}"
ALLOW_DIR="${CHECK_UI_ALLOW_DIR:-$SCRIPT_DIR}"
VERBOSE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --root|--rules)
      [ $# -ge 2 ] || { echo "check-ui: usage: check-ui.sh [--root DIR] [--rules FILE] [--verbose] ($1 needs a value)" >&2; exit 2; }
      if [ "$1" = --root ]; then ROOT="$(cd "$2" && pwd)"; else RULES_FILE="$2"; fi
      shift 2 ;;
    --verbose) VERBOSE=1; shift ;;
    *) echo "check-ui: unknown argument $1" >&2; exit 2 ;;
  esac
done
cd "$ROOT" || exit 2

SRC=web/src
ALLOW_CLASSES="$ALLOW_DIR/check-ui.allow-classnames"
ALLOW_GLOSSARY="$ALLOW_DIR/check-ui.allow-glossary"
ALLOW_COLOURS="$ALLOW_DIR/check-ui.allow-colours"
OUT="${CHECK_UI_OUT:-$ROOT/build/check-ui.txt}"
mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
VIOL="$TMP/violations.tsv" # rule <TAB> file <TAB> line <TAB> message
: >"$VIOL"

RULE_NAMES=(native-ui phosphor colour-literals class-hooks sizing glossary native-search back-link image-input type-scale opacity-muting word-break)

# ---------------------------------------------------------------- rules file
declare -A MODE FAIL_PATHS
for r in "${RULE_NAMES[@]}"; do MODE[$r]=warn; FAIL_PATHS[$r]=""; done
if [ -f "$RULES_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%#*}"
    [ -z "${line//[[:space:]]/}" ] && continue
    key="${line%%=*}"; val="${line#*=}"
    key="${key//[[:space:]]/}"; val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
    case "$key" in
      *.fail_paths) name="${key%.fail_paths}"; [ -n "${MODE[$name]+x}" ] || { echo "check-ui: unknown rule '$name' in $RULES_FILE" >&2; exit 2; }
                    norm=""; for p in $val; do norm+="${p%/} "; done   # "web/ui/" behaves like "web/ui"
                    FAIL_PATHS[$name]="$norm" ;;
      *) [ -n "${MODE[$key]+x}" ] || { echo "check-ui: unknown rule '$key' in $RULES_FILE" >&2; exit 2; }
         case "$val" in warn|fail) MODE[$key]="$val" ;; *) echo "check-ui: rule '$key' must be warn or fail, got '$val'" >&2; exit 2 ;; esac ;;
    esac
  done <"$RULES_FILE"
fi

# ------------------------------------------------------------------- helpers
viol() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >>"$VIOL"; }

# Source files of the given extensions under web/src, minus tests. One path per line, sorted.
src_files() {
  [ -d "$SRC" ] || return 0
  local args=() e
  for e in "$@"; do args+=(-o -name "*.$e"); done
  find "$SRC" -type f \( "${args[@]:1}" \) \
    ! -name '*.test.*' ! -name '*.spec.*' ! -name 'test-utils.*' ! -name '*.test-helper.*' ! -path "$SRC/test/*" | LC_ALL=C sort
}

# CSS declarations / selectors. Emits "S<TAB>line<TAB>selector" per block opened and
# "D<TAB>line<TAB>selector<TAB>prop<TAB>value" per declaration (innermost selector).
css_scan() { awk '
  function trim(s) { gsub(/^[ \t\r\n]+|[ \t\r\n]+$/, "", s); return s }
  function flush(   t, p, prop, val) {
    t = trim(buf)
    if (t != "" && depth > 0 && index(t, ":")) {
      p = index(t, ":"); prop = trim(substr(t, 1, p - 1)); val = trim(substr(t, p + 1))
      gsub(/[ \t\r\n]+/, " ", val)
      print "D\t" sline "\t" sel[depth] "\t" prop "\t" val
    }
    buf = ""; sline = 0
  }
  { text = text $0 "\n" }
  END {
    n = length(text); line = 1; depth = 0; par = 0; q = ""; buf = ""; sline = 0
    for (i = 1; i <= n; i++) {
      c = substr(text, i, 1)
      if (c == "\n") line++
      if (q != "") { buf = buf c; if (c == q) q = ""; continue }
      if (c == "/" && substr(text, i + 1, 1) == "*") {
        j = index(substr(text, i + 2), "*/")
        seg = (j ? substr(text, i, j + 3) : substr(text, i))
        k = split(seg, tmp, "\n"); line += k - 1
        i += (j ? j + 3 : n) - 1; buf = buf " "; continue
      }
      if (c == "\"" || c == "\047") { q = c; if (!sline) sline = line; buf = buf c; continue }
      if (c == "(") par++
      if (c == ")" && par > 0) par--
      if (par == 0 && c == "{") {
        s = trim(buf); depth++; sel[depth] = s; gsub(/[ \t\r\n]+/, " ", sel[depth])
        print "S\t" (sline ? sline : line) "\t" sel[depth]
        buf = ""; sline = 0; continue
      }
      if (par == 0 && c == ";") { flush(); continue }
      if (par == 0 && c == "}") { flush(); if (depth > 0) depth--; continue }
      if (!sline && c !~ /[ \t\r\n]/) sline = line
      buf = buf c
    }
  }' "$1"; }

# True when a CSS selector belongs to a token block (:root / html[data-theme]) where colour literals live.
is_token_selector() { case "$1" in :root*|html*|*"[data-theme"*) return 0 ;; esac; return 1; }

# code_match RULE MESSAGE REGEX < file-list : awk pass over TS/TSX files (comment lines skipped),
# one violation per matching line. REGEX is POSIX ERE (no \b).
code_match() {
  local rule="$1" msg="$2" re="$3" files=()
  mapfile -t files
  [ "${#files[@]}" -gt 0 ] || return 0
  [ -n "${files[0]}" ] || return 0
  RE="$re" awk -v RULE="$rule" -v MSG="$msg" '
    BEGIN { RE = ENVIRON["RE"] }
    FNR == 1 { inblk = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    $0 ~ RE { print RULE "\t" FILENAME "\t" FNR "\t" MSG }' "${files[@]}" >>"$VIOL"
}

# ------------------------------------------------------------------ rule 1
rule_native_ui() {
  local files
  files="$(src_files tsx ts | grep -v "^$SRC/ui/")"
  code_match native-ui "native <select>; use the Select primitive" '<select([ \t>/]|$)' <<<"$files"
  code_match native-ui "window.alert/confirm/prompt; use ConfirmDialog/Toast" 'window\.(alert|confirm|prompt)[^A-Za-z0-9_]' <<<"$files"
  code_match native-ui "bare alert()/confirm()/prompt(); use ConfirmDialog/Toast" '([(!;={,&|?:]|return)[ \t]*(alert|confirm|prompt)\(|^[ \t]*(alert|confirm|prompt)\(["\047`]' <<<"$files"
  while IFS= read -r f; do [ -n "$f" ] && native_inputs "$f" native-ui "$NATIVE_UI_TYPES" "native <input type=...>; use a field primitive"; done <<<"$files"
}

# ------------------------------------------------------------------ rule 7
rule_native_search() {
  local f
  src_files tsx | grep -v "^$SRC/ui/" | while IFS= read -r f; do
    [ -n "$f" ] && native_inputs "$f" native-search search 'native <input type="search">; use the SearchField primitive'
  done
}

NATIVE_UI_TYPES='checkbox|radio|date|time|number|range|color|file|datetime-local|month|week'

# Each <input ...> tag, however many lines it spans: the tag ends at the first '>' outside
# braces and quotes (so `onChange={() => x}` is fine). Flags a type= in TYPES (ERE alternation).
# native_inputs FILE RULE TYPES MESSAGE
native_inputs() { awk -v FILE="$1" -v RULE="$2" -v TYPES="$3" -v MSG="$4" '
  { l = $0
    if (inblk) { if (index(l, "*/")) inblk = 0; l = "" }
    else if (l ~ /^[ \t]*\/\//) l = ""
    else if (l ~ /^[ \t]*\/\*/) { if (!index(l, "*/")) inblk = 1; l = "" }
    gsub(/\/\*[^*]*\*\//, "", l)   # inline {/* ... */} comments on one line
    text = text l "\n" }
  END {
    n = length(text); pos = 1
    while ((p = index(substr(text, pos), "<input")) > 0) {
      at = pos + p - 1; pos = at + 6
      if (substr(text, at + 6, 1) !~ /[[:space:]\/>]/) continue
      d = 0; q = ""
      for (i = at + 6; i <= n; i++) {
        c = substr(text, i, 1)
        if (q != "") { if (c == q) q = ""; continue }
        if (c == "\"" || c == "\047" || c == "\140") { q = c; continue }
        if (c == "{") d++
        else if (c == "}") d--
        else if (c == ">" && d == 0) break
      }
      tag = substr(text, at, i - at + 1)
      if (tag ~ ("[[:space:]]type[[:space:]]*=[[:space:]]*[{]?[[:space:]]*[\"\047\140]?(" TYPES ")([\"\047\140}\\/>]|[[:space:]])")) {
        pre = substr(text, 1, at); ln = gsub(/\n/, "&", pre) + 1
        print RULE "\t" FILE "\t" ln "\t" MSG
      }
      pos = i + 1
    }
  }' "$1" >>"$VIOL"; }

# ------------------------------------------------------------------ rule 2
rule_phosphor() {
  src_files tsx ts | grep -v "^$SRC/ui/icons.ts$" |
    code_match phosphor "@phosphor-icons/react outside web/src/ui/icons.ts; use <Icon>" '@phosphor-icons/react'
  if [ -f "$SRC/ui/icons.ts" ]; then
    awk -v RULE=phosphor '
      /^[ \t]*\/\// { next }
      /@phosphor-icons\/react/ && $0 !~ /@phosphor-icons\/react\/dist\/csr\/[A-Za-z0-9]+["\047]/ {
        print RULE "\t" FILENAME "\t" FNR "\timport via @phosphor-icons/react/dist/csr/<Name> only (no barrel import)" }' "$SRC/ui/icons.ts" >>"$VIOL"
  fi
}

# ------------------------------------------------------------------ rule 3
COLOUR_RE='#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})([^0-9A-Za-z_-]|$)|(rgba?|hsla?|oklch|oklab|lab|lch)\([ \t]*[0-9.]'
# CSS named colours (lower-case; matched case-insensitively). `transparent`, `currentColor`
# and `inherit` are not colours and are deliberately absent. A word preceded by `-` (as in
# var(--white)) is a custom property name, not a colour.
NAMED_COLOURS='white|black|red|green|blue|yellow|orange|purple|pink|brown|gr[ae]y|silver|gold|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|indigo|violet|beige|ivory|tan|khaki|coral|salmon|crimson|tomato|orchid|plum|lavender|turquoise|chocolate|sienna|wheat|linen|azure|bisque'
# Properties whose values are never colours (font names, content strings, animation names...).
NON_COLOUR_PROP='^(font|content|animation|transition|grid|counter|quotes|list-style|src|unicode-range)'

rule_colour_literals() {
  local f
  while IFS= read -r f; do
    case "$f" in $SRC/theme/*) continue ;; esac
    css_scan "$f" | RE="$COLOUR_RE" NAMED="(^|[^a-z0-9_-])($NAMED_COLOURS)([^a-z0-9_-]|\$)" NONCOL="$NON_COLOUR_PROP" awk -F'\t' -v F="$f" '
      BEGIN { RE = ENVIRON["RE"]; NAMED = ENVIRON["NAMED"]; NONCOL = ENVIRON["NONCOL"] }
      $1 == "D" && $3 !~ /^(:root|html)/ && $3 !~ /\[data-theme/ && $5 ~ RE {
        print "colour-literals\t" F "\t" $2 "\tcolour literal in \047" $4 ": " $5 "\047; use var(--...)" }
      $1 == "D" && $3 !~ /^(:root|html)/ && $3 !~ /\[data-theme/ && $4 !~ NONCOL && tolower($5) ~ NAMED {
        print "colour-literals\t" F "\t" $2 "\tnamed colour in \047" $4 ": " $5 "\047; use var(--...)" }' >>"$VIOL"
  done < <(src_files css)
  src_files tsx | grep -v "^$SRC/theme/" |
    code_match colour-literals "colour literal in component; use var(--...)" \
      '["\047`]#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})["\047`;) ]|(rgba?|hsla?|oklch)\([ \t]*[0-9.]'
  # Named colours only where a colour is being set (style props, colour attributes), so UI copy
  # such as "Black pepper" is not a violation.
  src_files tsx | grep -v "^$SRC/theme/" |
    code_match colour-literals "named colour in component; use var(--...)" \
      "[A-Za-z-]*([Cc]olou?r|[Bb]ackground|[Ff]ill|[Ss]troke|[Bb]order|[Oo]utline|[Ss]hadow)[A-Za-z-]*[ \t]*[:=][ \t]*[\"'\`]($NAMED_COLOURS)[\"'\`]"
}

# ------------------------------------------------------------------ rule 4
# className tokens in .tsx, one "token<TAB>file<TAB>line" per use. Tokens ending in '*'
# come from template literals like `tile--${x}` and only need a CSS class with that prefix.
classname_tokens() { awk -v FILE="$1" '
  function isword(t) { return t ~ /^-?[A-Za-z_][A-Za-z0-9_-]*$/ }
  function emit(t, pre) { if (isword(t)) print t (pre ? "*" : "") "\t" FILE "\t" ln }
  function words(s, headDyn, tailDyn,   a, m, k, t, startsWs, endsWs) {
    startsWs = (s ~ /^[ \t\n]/); endsWs = (s ~ /[ \t\n]$/)
    m = split(s, a, /[ \t\n]+/)
    for (k = 1; k <= m; k++) {
      t = a[k]; if (t == "") continue
      if (k == 1 && headDyn && !startsWs) continue
      if (k == m && tailDyn && !endsWs) { emit(t, 1); continue }
      emit(t, 0)
    }
  }
  function expr(s,   i, n, c, q, j, d, buf, inner, headDyn) {
    n = length(s); i = 1
    while (i <= n) {
      c = substr(s, i, 1)
      if (c == "\047" || c == "\"") {
        j = i + 1; while (j <= n && substr(s, j, 1) != c) j++
        words(substr(s, i + 1, j - i - 1), 0, 0); i = j + 1
      } else if (c == "`") {
        i++; buf = ""; headDyn = 0
        while (i <= n && substr(s, i, 1) != "`") {
          if (substr(s, i, 2) == "${") {
            words(buf, headDyn, 1); buf = ""
            d = 1; j = i + 2
            while (j <= n && d > 0) { cc = substr(s, j, 1); if (cc == "{") d++; else if (cc == "}") d--; j++ }
            expr(substr(s, i + 2, j - i - 3)); i = j; headDyn = 1
          } else { buf = buf substr(s, i, 1); i++ }
        }
        words(buf, headDyn, 0); i++
      } else i++
    }
  }
  { text = text $0 "\n"; starts[NR] = length(text) - length($0) }
  END {
    n = length(text); pos = 1
    while ((p = index(substr(text, pos), "className=")) > 0) {
      at = pos + p - 1 + 10
      ln = 1; for (k = 1; k <= NR && starts[k] < at; k++) ln = k
      c = substr(text, at, 1)
      if (c == "\"") { j = index(substr(text, at + 1), "\""); words(substr(text, at + 1, j - 1), 0, 0); pos = at + j + 1 }
      else if (c == "{") {
        d = 1; j = at + 1
        while (j <= n && d > 0) { cc = substr(text, j, 1); if (cc == "{") d++; else if (cc == "}") d--; j++ }
        expr(substr(text, at + 1, j - at - 2)); pos = j
      } else pos = at
    }
  }' "$1"; }

rule_class_hooks() {
  local f kind line sel
  : >"$TMP/css-classes"
  while IFS= read -r f; do
    css_scan "$f" | while IFS=$'\t' read -r kind line sel _; do
      [ "$kind" = S ] || continue
      case "$sel" in @*) continue ;; esac
      grep -oE '\.-?[A-Za-z_][A-Za-z0-9_-]*' <<<"$sel" | sed 's/^\.//'
    done >>"$TMP/css-classes"
  done < <(src_files css)
  [ -f "$ALLOW_CLASSES" ] && sed -e 's/#.*//' -e 's/[[:space:]]//g' "$ALLOW_CLASSES" | grep -v '^$' >>"$TMP/css-classes"
  LC_ALL=C sort -u "$TMP/css-classes" -o "$TMP/css-classes"
  : >"$TMP/uses"
  while IFS= read -r f; do classname_tokens "$f" >>"$TMP/uses"; done < <(src_files tsx)
  # First use of each undefined token only.
  awk -F'\t' '
    NR == FNR { known[$0] = 1; list[++nk] = $0; next }
    {
      t = $1; if (seen[t]++) next
      if (sub(/\*$/, "", t)) { ok = 0; for (i = 1; i <= nk; i++) if (index(list[i], t) == 1) { ok = 1; break }; if (ok) next; t = t "<dynamic>" }
      else if (t in known) next
      print t "\t" $2 "\t" $3
    }' "$TMP/css-classes" "$TMP/uses" | while IFS=$'\t' read -r tok file ln; do
      viol class-hooks "$file" "$ln" "className '$tok' has no CSS rule (add one, or list it in scripts/check-ui.allow-classnames)"
    done
}

# ------------------------------------------------------------------ rule 5
rule_sizing() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" '
      $1 != "D" { next }
      ($4 == "min-height" || $4 == "min-block-size") {
        n = split($3, parts, ",")
        for (i = 1; i <= n; i++) {
          p = parts[i]; gsub(/^[ \t]+/, "", p)
          if (p ~ /(^|[^A-Za-z0-9_-])\.tile([-_]|[^A-Za-z0-9_-]|$)/) { print "sizing\t" F "\t" $2 "\t" $4 " on tile variant \047" p "\047; tiles size to content"; break }
        }
      }
      ($4 == "font-size" || $4 == "font") && $3 !~ /^(:root|html)/ && $5 ~ /(^|[^A-Za-z0-9_.-])[0-9.]+px/ {
        if ($4 == "font-size" || $5 ~ /[0-9.]+px[ \t]*(\/|[A-Za-z"\047])/) print "sizing\t" F "\t" $2 "\tpx " $4 " \047" $5 "\047; use a type token"
      }' >>"$VIOL"
  done < <(src_files css)
  src_files tsx | code_match sizing "px fontSize in component; use a type token" \
    'fontSize:[ \t]*["\047`]?[0-9.]+(px)?["\047`]?[ \t]*[,}]'
}

# ------------------------------------------------------------------ rule 6
rule_glossary() {
  [ -f GLOSSARY.md ] || return 0
  # terms.txt: every glossary term, lower-case; avoid.txt: "word<TAB>term" (words that are terms are dropped).
  awk '
    /^\*\*[^*]+\*\*:/ { t = $0; sub(/^\*\*/, "", t); sub(/\*\*:.*/, "", t); term = t; print tolower(t) > TERMS }
    /^_Avoid_:/ { s = $0; sub(/^_Avoid_:[ ]*/, "", s); n = split(s, a, /,[ ]*/)
      for (i = 1; i <= n; i++) { w = tolower(a[i]); gsub(/^[ ]+|[ ]+$/, "", w); if (w != "") print w "\t" term > AVOID } }
  ' TERMS="$TMP/terms.txt" AVOID="$TMP/avoid.raw" GLOSSARY.md
  [ -s "$TMP/avoid.raw" ] || return 0
  awk -F'\t' 'NR==FNR { term[$0]=1; next } !($1 in term)' "$TMP/terms.txt" "$TMP/avoid.raw" >"$TMP/avoid.txt"
  local f
  while IFS= read -r f; do
    awk -v FILE="$f" -v TERMS="$TMP/terms.txt" -v AVOID="$TMP/avoid.txt" -v ALLOW="$ALLOW_GLOSSARY" '
      function isw(c) { return c ~ /[a-z0-9-]/ }
      # Whole-word match of an avoid word and its inflections: s, es, d, ed, ing (and "invite" -> "inviting").
      function bounded(s, f,   p, b, a, r) {
        r = s
        while ((p = index(r, f)) > 0) {
          b = (p == 1) ? " " : substr(r, p - 1, 1)
          a = substr(r, p + length(f), 1)
          if (!isw(b) && !isw(a == "" ? " " : a)) return 1
          r = substr(r, p + 1)
        }
        return 0
      }
      function has(s, w,   f, n, k, stem) {
        n = 0
        f[++n] = w; f[++n] = w "s"; f[++n] = w "es"; f[++n] = w "d"; f[++n] = w "ed"; f[++n] = w "ing"
        if (substr(w, length(w), 1) == "e") { stem = substr(w, 1, length(w) - 1); f[++n] = stem "ing" }
        for (k = 1; k <= n; k++) if (bounded(s, f[k])) return 1
        return 0
      }
      BEGIN {
        while ((getline l < TERMS) > 0) terms[++nt] = l
        for (i = 1; i <= nt; i++) for (j = i + 1; j <= nt; j++) if (length(terms[j]) > length(terms[i])) { x = terms[i]; terms[i] = terms[j]; terms[j] = x }
        while ((getline l < AVOID) > 0) { split(l, pp, "\t"); aw[++na] = pp[1]; at[na] = pp[2] }
        while ((getline l < ALLOW) > 0) { sub(/#.*/, "", l); if (l ~ /^[ \t]*$/) continue; sub(/^[ \t]+/, "", l); sp = index(l, " "); if (!sp) continue
          allowp[++nal] = substr(l, 1, sp - 1); w = substr(l, sp + 1); gsub(/^[ \t]+|[ \t]+$/, "", w); alloww[nal] = tolower(w) }
      }
      {
        lineno = FNR
        # Tokenise: keep only the text inside quotes. A quote ends only at its own kind, so an
        # apostrophe inside a backtick string is content; \x escapes are kept as x; ${...} is
        # code and is skipped (brace-counted, may span lines); // and /* */ outside quotes are
        # comments. An unterminated "/\047 is dropped at end of line; a template keeps its quote
        # state and its text so far is checked on this line.
        out = ""; l = $0; n = length(l)
        for (i = 1; i <= n; i++) {
          c = substr(l, i, 1); c2 = substr(l, i + 1, 1)
          if (blk) { if (c == "*" && c2 == "/") { blk = 0; i++ } ; continue }
          if (ed > 0) { if (c == "{") ed++; else if (c == "}") ed--; continue }
          if (q == "") {
            if (c == "/" && c2 == "/") break
            if (c == "/" && c2 == "*") { blk = 1; i++; continue }
            if (c == "\047" || c == "\"" || c == "`") { q = c; seg = ""; continue }
            continue
          }
          if (c == "\\") { seg = seg c2; i++; continue }
          if (q == "`" && c == "$" && c2 == "{") { ed = 1; seg = seg " "; i++; continue }
          if (c == q) { out = out " " seg; seg = ""; q = ""; continue }
          seg = seg c
        }
        if (q == "`") { out = out " " seg; seg = "" } else { q = ""; seg = "" }
        out = tolower(out)
        for (i = 1; i <= nt; i++) { while ((p = index(out, terms[i])) > 0) out = substr(out, 1, p - 1) " " substr(out, p + length(terms[i])) }
        for (i = 1; i <= na; i++) {
          if (!has(out, aw[i]) || (lineno SUBSEP aw[i]) in done) continue
          done[lineno, aw[i]] = 1
          skip = 0
          for (k = 1; k <= nal; k++) if (allow_match(allowp[k], FILE) && alloww[k] == aw[i]) skip = 1
          if (!skip) print FILE "\t" lineno "\t" "avoid word \"" aw[i] "\" (use \"" at[i] "\")"
        }
      }
      function allow_match(p, f) { return p == "*" || index(f, p) > 0 }
    ' "$f" | while IFS=$'\t' read -r file n msg; do viol glossary "$file" "$n" "$msg"; done
  done < <(src_files ts | grep '/strings\.ts$')
}

# --------------------------------------------------------------------- run
rule_native_ui
rule_phosphor
rule_colour_literals
rule_class_hooks
rule_sizing
rule_glossary
rule_native_search

# ------------------------------------------------------------------ rule 8
rule_back_link() {
  src_files tsx ts | code_match back-link "back-link; use Breadcrumbs (PageHeader breadcrumbs={useBreadcrumbs()})" \
    '(^|[^A-Za-z0-9_])BackLink([^A-Za-z0-9_]|$)|<(Link|a)[ \t][^>]*>[ \t]*Back to|<IconButton[^<]*icon="back"[^<]*navigate\('
}
rule_back_link

# ------------------------------------------------------------------ rule 9
rule_image_input() {
  local files list
  files="$(src_files tsx ts | grep -v "^$SRC/ui/ImagePicker/")"
  code_match image-input "own image input; use the shared <ImagePicker> (ui/ImagePicker is the only place for accept=image, capture= and the upload URLs)" \
    'accept=[^>]*(image/|[.](png|jpe?g|webp|heic|heif|gif|avif))|[\x27"`]/api/images(/from-url)?[\x27"`]' <<<"$files"
  # capture= is flagged on any element but the shared <ImageFileInput>, whose boolean capture prop is how a feature asks for the camera
  # (the prop is the API; the attribute itself is still written only in ui/ImagePicker). The element runs from <ImageFileInput to its />.
  [ -n "$files" ] || return 0
  mapfile -t list <<<"$files"
  awk -v RULE=image-input -v MSG="own capture= attribute; ask for the camera with the shared <ImageFileInput capture>" '
    FNR == 1 { inblk = 0; ifi = 0 }
    inblk { if (index($0, "*/")) inblk = 0; next }
    $0 ~ /^[ \t]*\/\// { next }
    $0 ~ /^[ \t]*\/\*/ { if (!index($0, "*/")) inblk = 1; next }
    {
      line = $0
      if (line ~ /<ImageFileInput([^A-Za-z0-9_]|$)/) ifi = 1
      if (!ifi && line ~ /(^|[^A-Za-z0-9_-])capture=/) print RULE "\t" FILENAME "\t" FNR "\t" MSG
      if (ifi && index(line, "/>")) ifi = 0
    }' "${list[@]}" >>"$VIOL"
}
rule_image_input

# ------------------------------------------------------------------ rule 10
# DS-A (docs/design/system.md 1): feature CSS sets no font size or font outside the --text-* type roles (tokens live in :root).
rule_type_scale() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" '
      # a token block: every selector of the rule is :root or html[...] (round 2; a descendant of :root is a feature rule)
      function tokensel(t) { return (t ~ /^:root$/ || t ~ /^html(\[[^]]*\])*$/) }
      function alltok(list,   n, a, i, t) { n = split(list, a, ","); for (i = 1; i <= n; i++) { t = a[i]; gsub(/^[ \t]+|[ \t]+$/, "", t); if (!tokensel(t)) return 0 } return 1 }
      $1 != "D" { next }
      alltok($3) { next }
      ($4 == "font-size" || $4 == "font") {
        v = $5
        if (v == "inherit") next
        if ($4 == "font-size" && v ~ /^var\(--text-[A-Za-z0-9_-]+\)$/) next
        if ($4 == "font" && v ~ /var\(--text-/) next
        print "type-scale\t" F "\t" $2 "\t" $4 ": " v " on \047" $3 "\047; use a --text-* type role (system.md 1), not a raw size or font"
      }' >>"$VIOL"
  done < <(src_files css)
}

# ------------------------------------------------------------------ rule 11
# DS-A (docs/design/system.md 2): muted text is --color-muted, never a partial opacity. Disabled controls may fade.
rule_opacity_muting() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" '
      $1 != "D" || $4 != "opacity" { next }
      $3 ~ /:disabled|\[disabled|aria-disabled|data-disabled/ { next }
      {
        v = $5; sub(/[ \t]*!important.*$/, "", v)
        if (v ~ /^[0-9.]+%$/) { n = (v + 0) / 100 }
        else if (v ~ /^[0-9.]+$/) { n = v + 0 }
        else next
        if (n >= 0.5 && n <= 0.95) print "opacity-muting\t" F "\t" $2 "\topacity " v " on \047" $3 "\047 mutes content; use --color-muted for muted text (system.md 2)"
      }' >>"$VIOL"
  done < <(src_files css)
}

# ------------------------------------------------------------------ rule 12
# DS-A (docs/design/system.md 3): text wraps at a word boundary. Only a one-token value (email, URL, link, barcode, code) may break.
rule_word_break() {
  local f
  while IFS= read -r f; do
    css_scan "$f" | awk -F'\t' -v F="$f" '
      # the exemption reads the LAST compound of each selector (after a space, > + or ~); a selector list is judged per selector
      function lastc(t,   n, a) { gsub(/[ \t]*[>+~][ \t]*/, " ", t); gsub(/[ \t]+$/, "", t); n = split(t, a, /[ \t]+/); return a[n] }
      $1 != "D" { next }
      {
        p = $4; v = $5; sub(/[ \t]*!important.*$/, "", v)
        bad = 0
        if (p == "hyphens" && v == "auto") bad = 1
        else if ((p == "overflow-wrap" || p == "word-wrap") && (v == "anywhere" || v == "break-word")) bad = 1
        else if (p == "word-break" && (v == "break-all" || v == "break-word")) bad = 1
        if (!bad) next
        n = split($3, parts, ",")
        for (i = 1; i <= n; i++) {
          t = parts[i]; gsub(/^[ \t]+|[ \t]+$/, "", t)
          if (tolower(lastc(t)) ~ /email|url|link|barcode|code/) continue
          print "word-break\t" F "\t" $2 "\t" p ": " v " on \047" t "\047; wrap at a word and end in an ellipsis, never mid-word (system.md 3)"
        }
      }' >>"$VIOL"
  done < <(src_files css)
}
rule_type_scale
rule_opacity_muting
rule_word_break

# File-level colour allowlist (WP3b): drop colour-literals violations in files named by an entry that has a reason.
if [ -f "$ALLOW_COLOURS" ]; then
  awk -F'\t' -v ALLOW="$ALLOW_COLOURS" '
    BEGIN {
      n = 0
      while ((getline l < ALLOW) > 0) {
        h = index(l, "#"); if (!h) continue
        p = substr(l, 1, h - 1); r = substr(l, h + 1)
        gsub(/^[ \t]+|[ \t]+$/, "", p); gsub(/^[ \t]+|[ \t]+$/, "", r)
        if (p != "" && r != "") paths[++n] = p
      }
    }
    {
      if ($1 == "colour-literals") for (i = 1; i <= n; i++) if (index($2, paths[i]) > 0) next
      print
    }' "$VIOL" >"$TMP/violations.kept" && mv "$TMP/violations.kept" "$VIOL"
fi

LC_ALL=C sort -t$'\t' -k1,1 -k2,2 -k3,3n "$VIOL" >"$OUT"

in_fail_paths() { # rule file
  local p
  for p in ${FAIL_PATHS[$1]}; do case "$2" in "$p"|"$p"/*) return 0 ;; esac; done
  return 1
}

total_fail=0
echo "UI guards (docs/design/ui-fix-plan.md section 7):"
for r in "${RULE_NAMES[@]}"; do
  count=0; failing=0
  while IFS=$'\t' read -r rule file line msg; do
    [ "$rule" = "$r" ] || continue
    count=$((count + 1))
    if [ "${MODE[$r]}" = fail ] || in_fail_paths "$r" "$file"; then failing=$((failing + 1)); fi
  done <"$OUT"
  total_fail=$((total_fail + failing))
  eff="${MODE[$r]}"
  [ "$eff" = warn ] && [ -n "${FAIL_PATHS[$r]}" ] && eff="warn; fail in ${FAIL_PATHS[$r]}"
  printf '  %-16s %4d violations  [%s]\n' "$r" "$count" "$eff"
  if [ "$count" -gt 0 ]; then
    if [ "$VERBOSE" = 1 ]; then limit=100000; else limit=5; fi
    awk -F'\t' -v r="$r" -v lim="$limit" '$1 == r && ++n <= lim { printf "      %s:%s: %s\n", $2, $3, $4 } END { if (n > lim) printf "      ... %d more (see %s)\n", n - lim, OUTF }' OUTF="${OUT#"$ROOT"/}" "$OUT"
  fi
done
echo "  full list: ${OUT#"$ROOT"/}"
if [ "$total_fail" -gt 0 ]; then
  echo "UI guards FAILED: $total_fail violation(s) in fail mode"
  exit 1
fi
echo "UI guards OK (warn-mode violations do not fail the check)"
