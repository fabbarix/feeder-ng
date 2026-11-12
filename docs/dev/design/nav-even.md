# nav-even: an even bottom bar (beta.5, team NAV)

Status: decided by the user (option C, below). Red tests written; implementation follows.

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

## Why "equal slots" and "Scan centred" need a seventh button
With three buttons left of Scan and two right, equal slots and an exactly centred Scan are impossible (the left span 3s can never equal
the right span 2s). Options were A (keep 1fr/1.5fr), B (six equal, Scan off-centre) and C (a seventh button).

## Decision: option C (user)
A seventh top-level button, **Settings**, on the right: Today, Plan, Pantry | Scan | Shop, Recipes, Settings. Three on each side, so equal
slots and a centred Scan hold together. Settings leaves the avatar menu, which keeps Kitchen board, feature items and Sign out.

## Design
- `nav.ts`: `PRIMARY_NAV` gains `settings` (path `/settings`, icon `settings`) last; `RAIL_NAV` follows it; `MENU_NAV` is `board` only.
- The Settings tab is current on `/settings` and every `/settings/...` page (NavLink `end` is false for `settings`, as for `plan`), in the bar and in the rail.
- Avatar menu: one divider, directly before Sign out. `withAccessRequests` appends "Sign-in requests" after the shortcuts when no Settings entry exists.
- `.bottom-bar`: `grid-template-columns: repeat(7, minmax(0, 1fr))` (minmax(0, ...) so a long label such as "Settings" cannot widen a slot),
  `padding-inline: var(--space-1)` (the same at both ends), `column-gap: 2px`; the pill inset (padding) is at least the gap.
  At 360 px: 334 - 8 - 12 = 314 / 7 = 44.9 px per slot, so the 44 px target holds.
- Links keep `width: 100%`; Scan is `width: min(58px, 100%)`, `height: 58px`, `justify-self: center`, so it never overflows a narrow slot.
- Labels stay `nowrap`. If "Settings" does not fit a 44.9 px slot at 360 px, the developer may lower the label size at narrow widths
  through a `--text-nav-size` override in a max-width media query; the guard (rule 15) decides, it checks no label sticks out of its button.
- Rail: seven links of 56 x 56 (it already scrolls on short screens).
- Dark mode: only tokens are used, so layout is the same; guard rule 15 runs in light and dark.

## Tests (red now)
- `nav.test.ts`, `accessMenu.test.ts`, `AppShell.test.tsx` (bar and rail order, Settings icon and current state, menu contents, divider).
- `shell.css.test.ts` (seven equal tracks, symmetric padding, inset >= gap, Scan centred at 360..820, 44 px slots, Scan `min(58px, 100%)`).
- `scripts/check-shell-layout.mjs` rule 15 (360, 390, 820 bar; 1024, 1280 rail; light and dark; `1024` added to VIEWPORTS) and its source check in
  `scripts/test/check-shell-layout_test.sh` (passes now; rule 15 itself fails against a running app until the CSS is done).
