# Grids are sized by a minimum tile width, and the design rules are enforced by guards

Status: **Accepted** (2026-11-12). The user chose the recommended options after the beta.5 iPad review. **Target: 1.0.0-beta.5.1** for the shared foundation and Shop, Today and Plan; the other screens follow in later waves. Rules: [docs/design/system.md](../design/system.md).

## Context

On an iPad in portrait (834 to 1024 px), beta.5's Shop, Today and Plan broke words mid-word ("Cauliflo/wer", "cau-/liflower with pep-/pers"). Their tiles were ragged, their buttons wrapped into uneven rows, and they used colour for nothing. The user called the screens "a mess".

The causes were systemic, not local:
- **Columns.** `BentoGrid` and the Plan grid took a **column count** from each call site (2, 3, 4 or 7), so a tile's width depended on the viewport and not on what the tile holds.
- **Type.** Features set 55 raw font sizes.
- **Wrapping.** 34 rules broke words to fit.
- **Guards.** The page-layout guard never looked at tablet widths: its quick profile was 390, 1440 and 1920.

## Decision

1. **Grids are sized by a minimum tile width, not by a column count.**
   - `BentoGrid` takes `min` = `metric | card | day | wide` and lays out `repeat(auto-fill, minmax(min(var(--tile-min-*), 100%), 1fr))`. Its `columns` prop is removed.
   - A tile spans extra columns only to fill the **whole row** (`span="full"`), never to show status: Plan's today tile no longer spans 2.
   - Tile widths come from four tokens in `styles.css` (`--tile-min-metric|card|day|wide`).
2. **One row anatomy and one action group for every list.**
   - `ListRow` gains a value column (`value`, `subValue`) and a 2-line, word-wrapping title, and every row is at least 64 px high.
   - A new `ActionGroup` primitive allows at most one primary and one secondary, with the rest in a ⋮ `Menu`. It switches between wide and narrow layouts with a container query. Features no longer build their own rows or button rows.
3. **The rules are enforced by guards, phased in by folder.**
   - `scripts/check-ui.sh` gains `type-scale`, `opacity-muting` and `word-break`. They **fail** in `web/src/ui` and in each screen once its redesign wave lands (`check-ui.rules` `fail_paths`), and warn elsewhere until then.
   - The page-layout guard's **quick** profile (run by `check.sh` on every merge) adds 834×1194 and 1024×1366. Its seed uses long, realistic names, and it gains rule P12 (content under the bottom bar).

## Consequences

- **Every caller of `BentoGrid columns=` changes** (about 15 call sites). That is the point: the old counts are what broke tablets. Plan's `PlanGrid` uses `min="day"` and drops its `data-columns` CSS.
- **The kitchen board keeps its fixed 4×3 wall grid**, as the brief describes it, in its own board CSS rather than through `BentoGrid`. It is a display at a known size, not a responsive screen.
- **A slower guard.** The quick page-layout run takes about two more viewports' time (five instead of three).
- **Merge order.** Routes already in `fail_routes` (`/`, `/plan`, `/shop`, and others) can newly fail P11 or P12 at the tablet sizes until their redesign lands. The project manager merges DS-A together with, or just before, the Shop, Today and Plan waves of beta.5.1, and adds a route to `warn_routes` only with a dated note.
- **Screens not redone yet** keep warning on the new check-ui rules. Each later wave adds its folder to the three `fail_paths` lines.

## Considered options

- *Keep column counts and add more breakpoints* (3 at 768, 4 at 1024 …). This was tried in beta.4 and beta.5. Each new device width needs another breakpoint per call site, and a tile's content still decides nothing. Rejected.
- *A CSS-in-JS design system or a third-party component library.* It would replace working primitives and the existing token tests, and conflict with [CLAUDE.md](../../CLAUDE.md)'s crafted components. Rejected.
- *Fix only the three screens by hand.* That is what each beta did. Without shared primitives and guards the next screen regresses. Rejected.
