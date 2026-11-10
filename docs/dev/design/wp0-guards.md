# WP0 Guards (UI fix plan, round 2)

Spec: `docs/design/ui-fix-plan.md` section 7 "WP0 Guards". Scope: tooling and tests only, no production code.

## What exists

| File | Purpose |
|---|---|
| `scripts/check-ui.sh` | The six guards. grep/awk only. `--root DIR`, `--rules FILE`, `--verbose`. |
| `scripts/check-ui.rules` | **The one place to flip a rule**: `name=warn` or `name=fail`. All start in `warn`. |
| `scripts/check-ui.allow-classnames` | Rule 4 allowlist: one token per line, trailing `*` = prefix. |
| `scripts/check-ui.allow-glossary` | Rule 6 allowlist: `<path substring or *> <avoid word>`. |
| `scripts/test/check-ui_test.sh` + `fixtures/check-ui/<rule>/{pass,fail}/` | 74 assertions: pass and fail fixture per rule, exact counts, warn vs fail, `fail_paths`, bad rules file, `check.sh` behaviour, and the hardening cases (`native-ui-multiline`, `colour-named`, `glossary-quoting`). |
| `scripts/check.sh` | One added step, first in the run: `UI guards`. `CHECK_ONLY=ui` stops after it (used by the test). |
| `web/src/theme/contrast.test.ts` | Extended with the 3.1 pair table (see below). |

`make check` prints one line per rule with its violation count and mode, the first 5 violations, and writes the full list to
`build/check-ui.txt` (`--verbose` prints all). Exit is 1 only if a rule in `fail` mode (or a violation under that rule's `fail_paths`) has violations.

## Rules (names used in `check-ui.rules`)

1. `native-ui`: `<select>`, `window.alert|confirm|prompt`, bare `alert(`/`confirm(`/`prompt(` calls, `<input type="checkbox|radio|date|time|number|range|color|file|datetime-local|month|week">`, outside `web/src/ui/`. An `<input>` tag is read to its closing `>` (outside braces and quotes), so a `type=` on a following line is caught; `{/* */}` and `//` comment lines are skipped.
2. `phosphor`: `@phosphor-icons/react` anywhere but `web/src/ui/icons.ts`; inside it only `/dist/csr/<Name>` imports.
3. `colour-literals`: hex / `rgb()` / `hsl()` / `oklch()` literals in `.css` (except inside `:root` / `html` / `[data-theme]` blocks and `web/src/theme/`) and in `.tsx` string literals. Named colours (`white`, `black`, `navy`, `gold`, ... a list in `check-ui.sh` as `NAMED_COLOURS`) are flagged in CSS declaration values (not in `font*`, `content`, `animation*`, `transition*`, `grid*`, `counter*`, `quotes`, `list-style*`, `src`, `unicode-range`) and in `.tsx` only where a colour is set (`color:`/`fill=`/`backgroundColor:` ... with a quoted named colour), so UI copy such as "Black pepper" is fine. `transparent`, `currentColor`, `inherit` are not colours; `var(--white)` is a custom property name, not a colour.
4. `class-hooks`: every `className` token in `.tsx` (string, `{...}` expression, template literal; `tile--${x}` only needs a CSS class with prefix `tile--`) must appear as a `.class` in some `web/src/**/*.css` selector or in the allowlist. Reports each undefined token once (first use). Today: 96, as the plan says.
5. `sizing`: `min-height` / `min-block-size` on any selector with a `.tile` / `.tile-*` / `.tile--*` / `.tile_*` class; `px` `font-size` (and `font:` shorthand) in CSS outside token blocks; `fontSize: 13` / `'13px'` in `.tsx`. Custom property definitions (`--text-md: 16px`) are not flagged, so the WP1 token block is the only place px sizes live.
6. `glossary`: every `_Avoid_` word from `GLOSSARY.md` (parsed) inside the quoted strings of every `web/src/**/strings.ts`, whole word, optional plural, case-insensitive. Quotes are tokenised per line: a quote closes only on its own kind, so an apostrophe inside a backtick string is text, `\'` is text, `${...}` is code and skipped, multi-line template literals are checked line by line, and `//` and `/* */` outside quotes are comments. Glossary terms are blanked out first (so "Planned Meal" does not trip `meal`), and avoid words that are themselves terms (`Batch`, `Member`) are dropped. Allowlisted: `item` in the Shops strings ("Item code").

Test files (`*.test.*`, `*.spec.*`, `test-utils.*`, `*.test-helper.*`, `web/src/test/`) are never scanned.

## Flipping a rule (for later teams)

Edit one line in `scripts/check-ui.rules`: `class-hooks=fail`. Screen WPs that clean only their folders may instead keep `warn` and add
`class-hooks.fail_paths=web/src/ui web/src/features/plan` (space-separated prefixes): violations under those fail, the rest keep warning.
Intentional exceptions go in the allowlists with a comment saying why, never into the rule.

## contrast.test.ts decision

The 3.1 table (text/bg, text/surface, muted/surface-2, on-accent/accent, accent-text/soft, accent-text/soft-strong at 4.5; accent/surface, outline/surface at 3)
for 7 presets x light/dark is written, plus a Basil hex check (plan table, +-1 per channel). It cannot pass until WP1 renames the palette tokens, so it is
`describe.skipIf(!hasBentoTokens)`: **the block turns itself on the moment `generatePalette().colors` has the keys**
`bg surface surface2 surface3 line outline text muted accent onAccent accentText soft softStrong` (camelCase of the new CSS variables).
Today vitest reports them as skipped (113 skipped, nothing red). `TODO(WP1)` markers sit at the gate and at the status table.
If WP1 picks different key names, change `TOKEN_KEYS` (one line); do not weaken pairs. The status palette (5 statuses x light/dark text on container, white on solid >= 4.5) is
fixed data in the plan and runs today, green; WP1 should repoint it at the generated `--status-*` tokens.

## Decisions / limits

Hardened in round 2 (each with a pass and a fail fixture, exact counts in `check-ui_test.sh`):
- multi-line `<input ... type=...>` is caught by rule 1 (`native-ui-multiline/`);
- named colours are caught by rule 3 (`colour-named/`);
- rule 6 tokenises quotes, so apostrophes in backtick strings, `\'` escapes and multi-line templates are read correctly (`glossary-quoting/`).
  The old extraction missed `'It\'s a dish'` and a dish or meal on the second line of a template.

Still open:
- `className` built via helper calls: `clsx(...)` is covered as an expression, but `cn` args passed as props such as `iconClassName` are not.
- CSS parsing is a small awk state machine (comments, strings, parens, nested at-rules), no preprocessor syntax.
- Rule 4 counts unique tokens; rules 3 and 5 count lines.

Round 2 counts on the real tree (all rules still `warn`): native-ui 34 -> 42 (multi-line inputs now seen), colour-literals 14 (no named colours found), glossary 31 (unchanged, same allowlist), class-hooks 96, sizing 4, phosphor 0.
