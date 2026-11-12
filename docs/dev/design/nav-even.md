# nav-even: an even bottom bar (beta.5, team NAV)

Status: BLOCKED on one product question (below). No tests or implementation yet.

## Report (iPad)
The active pill on the end buttons (Today, Recipes) is cramped, Recipes nearly touches the bar's rounded edge, and the gap from Shop to
Recipes is wider than the others, so the bar looks lopsided.

## Root cause
`.bottom-bar` in `web/src/app/shell.css` is `grid-template-columns: 1fr 1fr 1fr 58px 1.5fr 1.5fr` with `padding: 0` and `gap: 0`;
`.bottom-bar__link` is `width: 100%` of its column.
- Left slots are 1fr, right slots are 1.5fr, so Shop and Recipes pills are 50 % wider than Today, Plan and Pantry. The 1.5fr was
  chosen so that three slots on the left and two on the right take the same width and Scan lands on the bar's centre (rule 12).
- The bar has no inner padding, so the first and last pills touch the rounded border box; the active pill has no breathing room at the
  ends (about 0 px against 8+ px between neighbours' content).
- Labels are centred in unequal slots, so label-to-label distance differs: Shop to Recipes is the widest.

## Why "equal slots" and "Scan truly centred" cannot both hold
Six buttons, three left of Scan and two right. If the five tab slots have equal width s and Scan has any width, the left span is 3s
and the right span 2s. Scan's centre is at the bar centre only if both spans are equal. That needs 3s = 2s, which is impossible for
any s, padding, gap or bar width. So one of the two requirements has to give, or the layout needs a sixth slot on the right.

## Options (needs the user's choice)
A. Keep Scan exactly centred; equalise what can be: the *pill* (active highlight) gets one fixed width and the bar gets uniform inner
   padding >= the gap, but slot widths stay 1fr x3 / 1.5fr x2. Label spacing on the right stays wider.
B. Equal-width slots (W/6 each, Scan included, 6 columns); Scan is no longer at the bar's centre (about s/2 = 30 px left of it at 390 px).
   Perfectly even; Scan is off-centre.
C. Seven slots: Today, Plan, Pantry, Scan, Shop, Recipes plus a seventh (for example the avatar or a "More" button) so three sit each
   side of Scan. Even and centred, but adds a button (a UX decision).

CSS for B once chosen: `grid-template-columns: repeat(6, 1fr); padding: 0 var(--space-2); gap: var(--space-1)`, links `width: 100%`.
CSS for C: `repeat(7, 1fr)` likewise. Guard rule 15 (every slot equal width +-1 px, Scan centre vs bar centre +-1 px, active pill inset >=
gap, at 360, 390, 820, 1024, 1280) is written once the option is fixed; under B the Scan-centre clause cannot be asserted.
