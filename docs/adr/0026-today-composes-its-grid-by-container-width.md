# Today composes its own grid by container width

Status: **Accepted** (2026-11-15; decision TB 1 of [ui-review-3/decisions.md](../design/ui-review-3/decisions.md), built by B9-44). Amends the
consequences of [ADR 0016](0016-design-system-rules-enforced.md) for Today only.

On a desktop Today was a stretched phone: `BentoGrid min="wide"` gave every tile the whole 1136 px row at 1440, and its column count flipped
when the navigation rail took width at 1024 px. The hero and the time-bound tiles (To confirm, Advance Steps) want to sit side by side, which
a grid sized by a minimum tile width cannot arrange.

## Decision

1. **Today lays out its own grid** (`features/today/today.css`, `.today__grid`), instead of the shared BentoGrid. `.today` is a size container
   named `today`; its columns come from the container's width, never from the viewport: one track below 40 rem, two from 40 rem, three from
   60 rem.
2. **From 60 rem** the hero and To confirm span two of the three tracks (areas `hero hero aside` / `confirm confirm aside`), and an aside in
   the third track stacks Advance Steps and the metric strip. The aside follows To confirm in the DOM; below 60 rem it dissolves and only
   CSS `order` moves the metric strip to the end of the page.
3. **No half-width orphan.** The other tiles are one track each; a last lone tile on two tracks takes the row, and on three tracks it is as
   wide as To confirm.
4. Today's page width is `default` (L-01), so the page is centred right of the rail at 1920 and 2560.

## Consequences

- ADR 0016's rule "grids by minimum tile width, no fixed column count" holds everywhere else; Today's `repeat(2|3, …)` lives only inside its
  container queries (`todayGrid.css.test.ts`, `todayDs.css.test.ts`).
- The grid keeps the `bento-grid` class and the group name "Today", so the page-layout scenarios that wait for `main .bento-grid` still work.
- `docs/design/system.md` §4 names the exception.
