# Feeder UI fix plan (Bento)

Status: proposal, 2026-11-10. Author: design review. Scope: the whole web SPA (`web/src`).
Inputs: [ux-brief.md](ux-brief.md) (direction **Bento**), the Bento-Phone / Bento-Tablet artboards in the design canvas
(https://claude.ai/artifact/5539a9cf-3992-453a-8fed-cb0c1a426dda), [GLOSSARY.md](../../GLOSSARY.md), [CLAUDE.md](../../CLAUDE.md)
(frontend rules, including "No native browser UI"), [architecture.md](../dev/architecture.md).

How this was reviewed: a separate build of `main` @ `cf54d0a` on port 8197 with a scratch data dir, seeded through the API
(4 Members including "Lucia Maria Bernadette", 10 Recipes with photos plus one with a very long name and two without a photo, 11 Meal Slots,
a 7-day plan, 10 Stock Lots including spoiled and use-soon ones, 3 Shops, 6 Products with Prices, a Shopping List with 3 extras).
Screens were captured with Chrome DevTools at 390×844 (phone), 820×1180 (tablet) and 1280×800 (desktop / kitchen board),
light and dark, plus offline and Slow 3G. Computed styles and token values were read from the live page.
Screenshots are in `build/ui-review/` of the `design/ui-fix-plan` worktree (`build/` is gitignored, so they are local evidence, not committed).

---

## 1. Executive summary: root causes

The user's verdict ("no distinctions, colours with no contrast nor difference, missing icons") is accurate, and it is not a
styling-polish problem. Ten root causes produce almost every symptom:

1. **The palette generator flattens every surface into one mint.** `theme/palette.ts` derives `background`, `surface`,
   `surfaceContainer*` and `primaryContainer` at HSL lightness 0.97 / 0.955 / 0.94 / 0.92 / 0.90 / 0.88 with saturation forced to ≥ 0.7.
   Measured on Basil: tile vs page **1.07:1**, accent tile vs page 1.17:1, nav bar vs page 1.07:1, active nav pill vs bar 1.09:1.
   Tiles are also *darker* than the page, the inverse of the mockup (near-white cards on a tinted ground). HSL lightness is not
   perceptual, so any fixed HSL recipe gives Teal 3.2:1 and Basil 5:1 at the same "lightness".
2. **Primitive variants exist in TypeScript but not in CSS.** `Chip tone="leftover" | "accent" | "spoil"` has no CSS at all (only
   `.tile[data-tone]` is styled), so every chip is `surface-container` (#dcf9e8), the *same colour as the neutral tile it sits on*
   (1.00:1): chips disappear and read as plain text. The `tonal` button equals the accent tile (1.00:1), so "Mark as Cooked" vanishes on
   Today. The `ghost` button is unstyled text. More broadly, **96 of 245 class names used in components (39 %) have no CSS rule**: the
   Recipes, Shop, Scan, Stock, Import and Ingredients screens and half of the board render with browser defaults.
3. **There is no icon system.** Zero icons ship. `Button.icon` and `Chip.icon` slots are never used. The nav, actions, chips, Meal Slots and
   empty states are all text.
4. **There is no layout system.** Tiles get fixed `min-height`s (120/160/220 px) instead of sizing by content; a Tile with `onClick` becomes a
   `<button>`, which vertically *centres* its content (Today's Next Planned Meal floats in the middle of a 450 px tile); screens add their own
   padding on top of the shell (Today is inset 32 px instead of 16 px); the content's bottom padding (96 px) ignores the raised Scan button
   and the safe area, so the last tile is clipped behind the bar; the chromeless shell keeps the desktop grid
   (`grid-template-columns: 220px 1fr`), so **the kitchen board and Cook Mode collapse into a 220 px column on any screen ≥ 900 px**;
   `<img>` has no `max-width`, so Recipes and Recipe detail scroll horizontally (page width 861 px at a 390 px viewport).
5. **There is no action hierarchy.** Every Planned Meal shows Swap, Confirm and Mark as Cooked at the same weight, on every day, including
   future days where "Mark as Cooked" is meaningless. Delete looks like Archive. There is no primary action per tile and no
   "Cook" entry point on Today or Recipe detail.
6. **Native browser UI and no form primitives.** 37 native controls in 23 files: 9 `<select>`, `window.confirm` (Recipe delete),
   `type="time"` (renders 12-hour "10:00 PM" in a 24-hour app), `date`, `number`, `range`, `color`, `file`, raw checkboxes and radios.
   The Recipe editor and Settings are unstyled HTML forms. This directly breaks the CLAUDE.md "No native browser UI" rule.
7. **Content is dumped, not designed.** Facts are rendered as chips (1 Batch, 3.5 portions), so chips stop meaning anything; the same reason is
   shown twice ("Leftover from Tuesday" + "leftover from Tue"); data strings are concatenated without separators ("feta200 gWent off",
   "eggs4 pieces1 Stock Lot"); placeholders are bare em-dashes ("—" under every Shopping List line); Ingredient names are lower-case.
8. **State handling collapses into "empty".** Offline, Stock shows "Nothing in Stock yet", Recipes shows "No Recipe matches." and Shop
   (the screen used *in the shop*, offline-first by spec) renders only its title. There is no offline banner, no skeletons, and a blank white
   page during boot on slow networks.
9. **Dark mode is not designed.** Status tiles are hard-coded light colours in `styles.css` (`#ffdad1`, `#fff0b3`), so a pale pink tile glares
   on a near-black page (13.5:1 against the page); `STATUS_COLORS.dark` exists in `palette.ts` but nothing reads it. `primary` is not
   re-toned for dark, so the Scan button is 2.5:1 against the bar. The dark surfaces are saturated bottle-green rather than tinted neutrals.
10. **Tablet and desktop are just stretched phones.** The Plan is 2 columns at 1280 px; the bottom bar spreads 5 labels across 820 px; the side
    rail is a text list with no icons.

**Top priorities, in order:** (1) new tone-based tokens and dark mode; (2) style every primitive variant, add the Phosphor `Icon` wrapper and
the nav; (3) fix the shell layout bugs (chromeless grid, bottom padding, image overflow, tile-as-button); (4) action hierarchy on Plan/Today;
(5) replace native controls with crafted primitives; (6) offline/error states; then screen-by-screen redlines. Packages and parallelism are
in section 7.

---

## 2. Workflow analysis

Tap counts are from the phone build. "Tap" = one deliberate touch; scrolling is listed separately.

### 2.1 See what's for dinner today
- **Now:** open app → Today. The Next Planned Meal tile shows Recipe, slot and one why chip, but its content is vertically centred in a
  450 px tile beside a taller "Throw out or keep?" tile, so the eye lands on the spoil tile first. There is no photo, no start time, no Cook action.
  The whole tile is a `<button>`, so it cannot hold a Cook action of its own. 0 taps to see it, but low salience.
- **Friction:** spoil housekeeping outranks dinner; no "start by" time (the planner knows Advance Steps and durations); no route into Cook Mode.
- **Proposed:** Today's first tile is the **Tonight hero** (full width, accent fill): overline "DINNER · 19:30 · start 18:45", Recipe name 26/800,
  up to 2 why chips, primary button **Cook · 45 min** (opens Cook Mode, 1 tap). Photo as a 72 px rounded thumb on the right when there is one.
  Below it, half tiles by urgency: Advance Step due, Leftovers to use, To confirm, Use soon, streak.

### 2.2 Confirm / cook a meal
- **Now:** Plan → find the day → "Mark as Cooked" (rendered as a tonal button identical to the tile, or plain text) → sheet "How many portions are
  left over?" with a native number input → "Mark as Cooked". 3 taps + typing. "Confirm" (pins the meal) sits next to it with the same weight,
  and is easily confused with confirming it was cooked.
- **Friction:** "Confirm" vs "Mark as Cooked" ambiguity; actions on future days; no success feedback beyond a toast that the bar can cover.
- **Proposed:** On Today, after the slot time the hero turns into **"Chicken & leek pie cooked?"** with primary **Yes, Cooked** and secondary
  **Adjust** (mockup). Yes = 1 tap: marks Cooked with the planned Leftover portions, then shows the "Cooked, nice one! 2 portions → Wed lunch"
  success tile (brief: "a friendly check plus where the Leftovers went"). Adjust opens the Mark as Cooked sheet with a crafted ±0.5 `Stepper`
  (no keyboard). On Plan, "Mark as Cooked" is shown only for today and past uncooked meals. Rename the pin action from "Confirm" to **Pin**
  (glossary term **Pinned**), with a `PushPin` icon, and move it into the swap/overflow menu.

### 2.3 Swap
- **Now:** Plan → day tile → "Swap" (plain text) → bottom sheet listing alternatives (only 1 shown in our seed; spec says 3) with chips and a
  "Swap" button per alternative; no photos. 2 taps.
- **Friction:** the trigger is invisible; alternatives have no thumbnails; why chips are generic ("already in Stock"); the sheet's container gets
  a green focus ring on open.
- **Proposed:** a 32 px `IconButton` (`ArrowsLeftRight`) top-right of each Planned Meal (mockup). Sheet title "Swap for…", 3 alternative rows
  (`ListRow` with 48 px photo thumb, Recipe name, one why chip, chevron); tap a row = swap and pin (1 tap), toast "Swapped · Undo".
  "Keep it" tertiary button at the bottom. Total 2 taps.

### 2.4 Plan the week
- **Now:** Plan is a 2-column grid of day tiles, each listing every Planned Meal with 2–5 chips and 3 buttons; one day tile is ~880 px tall at
  phone width, so a week is 6,000 px of scrolling (full-page capture: 3,037 CSS px). Regenerate is a pale pill top-right.
- **Friction:** density without hierarchy; tiles in a row have unequal heights; nothing tells you what is Pinned vs auto-planned at a glance.
- **Proposed:** compact day tiles as in the mockup: overline date ("WED 11"), per Planned Meal a slot line with icon ("☀ Lunch" = `Sun`),
  Recipe name 15/800, **one** state-or-why chip, and the swap icon button. Today spans 2 columns with a 2 px accent ring (not a different fill).
  Past/Cooked meals at 55 % opacity with a `CheckCircle` chip. Tap a Planned Meal row → **Planned Meal sheet** with all chips, Batch/portion facts,
  Attendance avatars and the full action set (Cook, Mark as Cooked, Swap, Pin/Unpin, Choose a Recipe). Regenerate becomes a secondary button with
  `ArrowsClockwise` plus a confirm dialog that states how many unpinned Planned Meals will change. Tablet: 4 columns; desktop ≥1200: 7 columns (a true week).

### 2.5 Shop and scan in store
- **Now:** Scan (raised centre button) → "Where are you shopping?" with three 160 px-tall tiles for shop names → (camera; not testable here) →
  Shop tab shows a progress tile with an empty bar, a cost tile ("—", "19 without a price"), date chips that wrap to 2 lines, then 22 line tiles
  each 130 px tall with a tiny pill-shaped tick box and a "—" cost. Offline: Shop renders only its title.
- **Friction:** in-store use is one-handed and offline; the list is 3,000+ px; the tick target is ~16×6 px; the Shop picker wastes the screen.
- **Proposed:** Shop picker = `ListRow`s (56 px, `Storefront` icon, last-visited meta, "Stock-take at home" as the last row with `HouseLine`).
  Scanning screen = 140 px viewfinder strip (dark `#10131a` frame, white reticle, accent scan line, torch `IconButton` `Flashlight`) above the live list.
  Shopping List = 2 metric tiles (accent "**14** left to get", surface "**€38.40** est. at Coop") then **2-column item tiles 96 px min** (mockup) or, at
  > 30 lines, a dense `ListRow` list grouped by aisle-less Ingredient name. Tick = whole tile, 24 px check box with 2 px outline → filled accent with `Check`.
  Ticked tiles fade to soft + strikethrough and sort to the end. Range chips become one `Select` ("Until Mon 16") in the header. Offline: keep the
  cached list, show the offline banner, queue scans (spec), never blank.

### 2.6 Stock-take at home
- **Now:** Scan → "Stock-take at home" (tonal pill) → (camera flow, not reviewable without a camera) → Stock-take sheet. Stock screen lists
  Stock Lots as 2-column tiles with run-on text ("feta200 g1 Stock Lot") and a large "Throw out or keep?" tile with bulleted rows.
- **Proposed:** Stock = search field + filter chips (All · Use soon · Spoiled) + `ListRow`s: Ingredient name (sentence case), total quantity right-aligned
  tabular ("200 g"), meta "1 Stock Lot · goes off Thu" in spoil colour when due. "Throw out or keep?" becomes a status tile at the top, one row per
  Stock Lot with two icon+label buttons (`Trash` Throw out = danger tertiary, `Check` Keep = secondary). Stock-take entry is a secondary button
  "Stock-take" with `Barcode` in the Stock header, not only behind Scan.

### 2.7 Cook with timers
- **Now:** Cook Mode shows the title, 3 chips ("1 Batch", "Voice commands off", "Screen stays awake"; two are toggles disguised as chips),
  an Advance Steps tile with a long button 'Mark "Marinate the chicken…" as done', the step tile (Step 1 of 4, 28 px regular text), Back/Next.
  No Exit, no timer tiles until a timer starts, no visible tap zones. On desktop/tablet ≥ 900 px it collapses into the 220 px column (root cause 4).
- **Proposed (mockup):** top row: `Exit` secondary (44 px, `X`) + "Step 1 of 5" pill + `IconButton` voice (`Microphone`/`MicrophoneSlash`, fill when on).
  Step tile fills the remaining height: overline "PASSIVE · 15 MIN TIMER" in accentText, text 30/800 (phone) / 58/800 (tablet), "uses" line in muted.
  Timer tiles 2-up beneath. Back (1 part) / Next (2 parts) 64 px tiles; last step's Next = **Mark as Cooked**. Advance Steps due appear as a
  status tile *before* step 1 only if not done ("Marinate the chicken · 4 h ahead" + Done button). Keep-awake is silent (no chip).

### 2.8 Import a recipe
- **Now:** Recipes → "Import" (tonal pill among 4 equal pills) → "Choose a .feeder.json file" (native file input) / paste JSON textarea → Review.
- **Friction:** the Agent Prompt flow (the main way to import from the web) is a sibling pill, not a guided step.
- **Proposed:** Recipes header has one primary `+ New Recipe` and an overflow `IconButton` (`DotsThreeVertical`) with Import, Export, Copy Agent Prompt.
  Import screen = 3 numbered step tiles: (1) "Copy the Agent Prompt" (`Robot`, primary Copy, toast "Copied"), (2) "Paste the Recipe File or choose a file"
  (drop zone with `FileArrowUp`, textarea styled as a field), (3) Review. Import Review: one `ListRow` per Ingredient with status chip
  (New / Matched / Needs a decision) and a rich `Select` with suggestions (score, Base Unit), sticky bottom bar with "Import 3 Recipes".

---

## 3. Design system foundation

### 3.1 Colour

**Principle (from the brief and mockup):** a *tinted ground* with *near-white cards*, the accent spent on one hero tile, primary buttons and the
active nav item; status colours fixed and never derived from the accent; every status also carries an icon and a word so it never relies on hue
(accent presets include Teal and Tomato, which sit near the status hues).

**Generation rule (replaces the HSL recipe in `palette.ts`):** work in **OKLCH**. Take the accent's hue *h* and chroma *C* (clamped to 0.04–0.16).
Each token is a fixed OKLCH tone (L) and chroma; `ensureContrast` stays as a safety net. Verified for all 7 presets (Basil, Tomato, Saffron,
Blueberry, Aubergine, Teal, Slate) in both schemes: every text pair ≥ 4.5:1, every control boundary ≥ 3:1.

| Token | Role | Light L / C | Dark L / C | Basil light | Basil dark |
|---|---|---|---|---|---|
| `--color-bg` | page ground | 0.955 / 0.018 | 0.16 / 0.012 | `#e7f4eb` | `#090f0b` |
| `--color-surface` | tiles, cards, nav bar, sheets | 0.995 / 0.006 | 0.215 / 0.018 | `#fafffc` | `#131c16` |
| `--color-surface-2` | secondary buttons, inputs fill, icon buttons | 0.925 / 0.025 | 0.27 / 0.022 | `#daecdf` | `#1e2a22` |
| `--color-surface-3` | pressed, selected rows | 0.885 / 0.035 | 0.32 / 0.026 | `#c8e0cf` | `#28372d` |
| `--color-line` | dividers, card hairline | 0.86 / 0.03 | 0.35 / 0.025 | `#c2d7c9` | `#303f35` |
| `--color-outline` | input and checkbox borders (≥3:1) | 0.56 / 0.03 | 0.62 / 0.03 | `#677a6d` | `#788c7f` |
| `--color-text` | primary text | 0.22 / 0.02 | 0.95 / 0.01 | `#131d17` | `#e9f1ec` |
| `--color-muted` | secondary text, labels | 0.45 / 0.025 | 0.78 / 0.02 | `#4b5a4f` | `#aebbb2` |
| `--color-accent` | hero tile, primary button, Scan, active indicator | 0.50 / C | 0.78 / C | `#34724e` | `#89c8a0` |
| `--color-on-accent` | text/icons on accent | white | 0.20 / 0.04 | `#ffffff` | `#051b0e` |
| `--color-accent-text` | accent-coloured text/icons on surfaces | 0.40 / C | 0.86 / C | `#135533` | `#a2e3b9` |
| `--color-soft` | why chips, active nav pill, secondary-accent buttons | 0.90 / 0.06 | 0.32 / 0.06 | `#bfebcd` | `#143c25` |
| `--color-soft-strong` | pressed soft, progress track fill | 0.84 / 0.09 | 0.38 / 0.08 | `#9addb2` | `#144f30` |

Measured contrast (Basil; worst case over the 7 presets in brackets):

| Pair | Light | Dark |
|---|---|---|
| text / bg | 15.3 (15.1) | 16.8 (16.7) |
| muted / surface-2 | 5.9 (5.9) | 7.5 (7.5) |
| on-accent / accent | 5.7 (5.7) | 9.3 (8.7) |
| accent-text / soft | 6.7 (6.7) | 8.4 (8.2) |
| accent-text / soft-strong | 5.6 (5.6) | 6.5 (6.5) |
| accent / surface (button boundary) | 5.7 (5.7) | 9.0 (8.4) |
| outline / surface (field boundary) | 4.5 (4.5) | 4.9 (4.8) |
| surface / bg (card vs ground) | 1.12 | 1.11 |

Card vs ground is deliberately low (as in the mockup); separation comes from the tone step **plus** `--elev-1` in light and a 1 px `--color-line`
hairline in dark. Cards are not interactive boundaries, so WCAG 1.4.11 does not apply; every *control* inside them clears 3:1.

**Status palette (fixed, never derived):** OKLCH hues chosen to stay apart from each other; each has a soft container, a text colour and a solid.

| Status | Meaning | Icon | Light text / container | Dark text / container | Solid (white text) | Ratios L / D |
|---|---|---|---|---|---|---|
| `leftover` | served from a Leftover, "+0.5 Leftover" | `BowlFood` | `#065353` / `#c2f3f2` | `#85e4e3` / `#043535` | `#027879` | 7.3 / 9.1 |
| `spoil` | Use soon, goes off, overdue Advance Step | `HourglassMedium` | `#6d3706` / `#fee1cf` | `#fec39b` / `#44250c` | `#9e5106` | 7.7 / 8.9 |
| `danger` | Spoiled, delete, errors, couldn't plan | `WarningCircle` | `#742e2b` / `#ffe0dc` | `#febfb9` / `#47211e` | `#ab413e` | 7.8 / 8.9 |
| `success` | Cooked, Shopping List complete, saved | `CheckCircle` | `#115629` / `#d1f2d7` | `#a7e2b2` / `#14361d` | `#0a7e3a` | 7.3 / 9.0 |
| `pinned` | Pinned Planned Meal, Slot Rule | `PushPin` | `#3e3f7c` / `#e3e6fe` | `#c7cdff` / `#282a4b` | `#5b5cb7` | 7.7 / 8.9 |

These replace `STATUS_COLORS` and the hard-coded `#ffdad1` / `#fff0b3` in `styles.css`, and are emitted as `--status-<name>-fg|bg|solid`, switched
by scheme. Member colours (`Member.colour`) are used only for the Member's avatar ring/dot, never for surfaces.

**Planned Meal state accents** (the "per meal/state" axis; Meal Slots themselves get icons, not colours, to keep the calm base):

| State | Tile treatment | Chip |
|---|---|---|
| Auto-planned, open | surface | first why chip, `soft` |
| Pinned | surface | `pinned` chip "Pinned" |
| Served from Leftover | surface | `leftover` chip "Leftover from Mon" |
| Cooked | surface, content 55 % opacity | `success` chip "Cooked" |
| Not cooked | surface, Recipe name struck through, 55 % | neutral chip "Not cooked" |
| Unfilled ("couldn't plan") | dashed 1.5 px `--color-outline` border, `bg` fill | `danger` chip + reason |
| Today | 2 px inset ring `--color-accent` (Plan), accent fill (Today hero) | – |

**Dark mode:** follows `prefers-color-scheme` unless the User picks Light/Dark; the board additionally dims after sunset (existing logic).
No drop shadows in dark; elevation = one tone step up plus a hairline. Photos get `filter: brightness(.92)` in dark.

### 3.2 Type (Figtree, self-hosted; add weight 800, currently only 400–700 load)

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `display` | 34 / 38 | 800 | metric numbers (14 left, 3 wk), clock on phone |
| `title-1` | 28 / 32 | 800 | screen title (Today, Plan, Recipes) |
| `title-2` | 22 / 26 | 800 | sheet/dialog title, hero Recipe name on tablet |
| `title-3` | 18 / 22 | 800 | tile title, Recipe name on hero (phone 26/28 hero override) |
| `body-strong` | 15 / 20 | 700 | Recipe names in tiles and rows, list titles |
| `body` | 15 / 22 | 500 | running text |
| `meta` | 13 / 18 | 500 | secondary lines (muted) |
| `label` | 13 / 16 | 700 | buttons (15/700 at md), chips (12/700), nav (11/800) |
| `overline` | 12 / 16 | 800, +0.04em, uppercase | tile headers ("DINNER · 19:30", "USE SOON") |

Tabular numerals on everything numeric (already global). Board scale: multiply by 1.75 (clock 76/800, hero 52/800). Cook step text 30/800 phone,
58/800 tablet. Never below 12 px. Sentence case everywhere except overlines; Ingredient names render with the first letter capitalised
(display-only transform, keep stored names).

### 3.3 Spacing, radii, elevation, motion

- **Spacing (4-pt):** `--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-10` 40, `-14` 56.
  Page gutter 16 (phone), 24 (tablet), 32 (desktop). Bento gap 10 phone / 12 tablet / 16 board. Tile padding 16 phone / 20 tablet / 26 board.
  Gap inside a tile: 6 between overline and title, 10 between groups.
- **Radii:** chip 999; control/input 14; button 16 (md) / 20 (lg); tile-sm 20; tile 24; hero 28; board tile 32; sheet 28 (top corners);
  dialog 28; thumb 12 (48 px) / 16 (72 px); nav bar 24.
- **Elevation (light only):** `--elev-0` none; `--elev-1` `0 1px 2px rgb(16 24 20 / .06), 0 0 0 1px rgb(16 24 20 / .03)` (cards);
  `--elev-2` `0 6px 20px rgb(16 24 20 / .12)` (nav bar, raised Scan, menus); `--elev-3` `0 -8px 32px rgb(0 0 0 / .18)` (sheets, dialogs).
  Scrim `rgb(8 12 10 / .45)`.
- **Motion:** `--dur-1` 120 ms (press, hover), `--dur-2` 180 ms (state, chip select), `--dur-3` 240 ms (sheet/dialog in, tile reorder);
  `--ease-out` `cubic-bezier(.2,.8,.2,1)`, `--ease-spring` `cubic-bezier(.34,1.56,.64,1)` for celebrations (≤ 250 ms). Press = scale .97.
  Ticked Shopping List line slides out 240 ms. `prefers-reduced-motion`: opacity fades only, ≤ 120 ms.

### 3.4 Icons: Phosphor

**Library:** Phosphor Icons, React package **`@phosphor-icons/react`** (v2.1.10, verified: all 90 icon names below exist under `dist/csr/`; v2 component names end in `Icon`, e.g. `HouseIcon`).

**Bundle discipline:** import each icon from its own module, never from the barrel, and only in one file:

```ts
// web/src/ui/icons.ts — the ONLY file allowed to import from @phosphor-icons/react
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House'
import { CalendarDotsIcon } from '@phosphor-icons/react/dist/csr/CalendarDots'
import { BarcodeIcon } from '@phosphor-icons/react/dist/csr/Barcode'
// …one line per icon in the table below
export const icons = {
  today: HouseIcon,
  plan: CalendarDotsIcon,
  scan: BarcodeIcon,
  // …
} as const
export type IconName = keyof typeof icons
```

Per-icon paths keep Vite from transpiling the 9,000-module barrel in dev and guarantee only listed icons reach the bundle. Screens use
semantic names (`<Icon name="swap" />`), never Phosphor names, so swapping a glyph is a one-line change. A check (section 7) fails the build if
`@phosphor-icons/react` is imported anywhere else.

**Weights:**
- `regular` (default) for every icon at ≥ 18 px.
- `bold` for icons ≤ 16 px (chips, dense meta), where regular strokes thin out.
- `fill` for the **active/selected** state only: active nav item, selected filter chip, toggles that are on (voice), Favourite set, ticked check.
- `duotone` only for **empty-state art** (64 px in a 96 px soft circle), where the second tone takes `--color-accent` at 20 % opacity.
- Never `thin` or `light`.

**Sizes:** nav 24 (Scan 28); buttons md 20, lg 22; icon buttons 20 in a 40 px visual / 44 px hit area (32 px compact variant with 16 icon);
chips 14 bold; tile overline icons 16 bold; tile feature icon 22–24 (mockup); list-row leading 24 in a 40 px tinted square; empty states 64 duotone;
board ×1.5. Icons inherit `currentColor`; colour comes from the parent token, never a prop.

**Icon map (semantic name → Phosphor):**

| Area | Semantic name | Phosphor |
|---|---|---|
| Nav | today | `House` |
| Nav | plan | `CalendarDots` |
| Nav | scan (raised) | `Barcode` |
| Nav | shop | `Basket` |
| Nav | recipes | `BookOpenText` |
| Avatar menu | stock | `Package` |
| Avatar menu | ingredients | `Carrot` |
| Avatar menu | products | `ShoppingBagOpen` |
| Avatar menu | shops | `Storefront` |
| Avatar menu | settings | `GearSix` |
| Avatar menu | signOut | `SignOut` |
| Settings | household | `HouseLine` |
| Settings | members | `UsersThree` |
| Settings | mealSlots | `Clock` |
| Settings | planningRules | `SlidersHorizontal` |
| Settings | notifications | `Bell` |
| Settings | allowlist | `UserPlus` |
| Settings | appearance | `Palette` |
| Settings | barcodes | `Barcode` |
| Meal Slot | breakfast | `Coffee` |
| Meal Slot | lunch | `Sun` |
| Meal Slot | dinner | `MoonStars` |
| Meal Slot | snack | `Cookie` |
| Meal Slot | other (custom names) | `ForkKnife` |
| Plan action | cook | `CookingPot` |
| Plan action | markCooked | `CheckCircle` |
| Plan action | notCooked | `XCircle` |
| Plan action | swap | `ArrowsLeftRight` |
| Plan action | pin / unpin | `PushPin` / `PushPinSlash` |
| Plan action | chooseRecipe | `MagnifyingGlass` |
| Plan action | regenerate | `ArrowsClockwise` |
| General action | add | `Plus` |
| General action | edit | `PencilSimple` |
| General action | archive / unarchive | `Archive` / `ArrowCounterClockwise` |
| General action | delete, throwOut | `Trash` |
| General action | keep, tick, confirm | `Check` |
| General action | close | `X` |
| General action | back / next | `ArrowLeft` / `ArrowRight` |
| General action | more | `DotsThreeVertical` |
| General action | search | `MagnifyingGlass` |
| General action | filter / sort | `FunnelSimple` / `SortAscending` |
| General action | expand (select caret) | `CaretUpDown` |
| General action | chevron (row) | `CaretRight` |
| General action | copy | `Copy` |
| General action | undo | `ArrowCounterClockwise` |
| Import/export | import / export / agentPrompt / file | `DownloadSimple` / `UploadSimple` / `Robot` / `FileArrowUp` |
| Scan | torch on / off | `Flashlight` (fill when on) |
| Scan | stockTake | `HouseLine` |
| Scan | unknownBarcode | `Question` |
| Scan | weigh | `Scales` |
| Shop | price | `Coins` |
| Shop | extra (manual line) | `NotePencil` |
| Cook | timer | `Timer` |
| Cook | pause / resume | `Pause` / `Play` |
| Cook | addMinute | `PlusCircle` |
| Cook | voice on / off | `Microphone` (fill) / `MicrophoneSlash` |
| Cook | exit | `X` |
| Chip / state | why (generic planner reason) | `Sparkle` |
| Chip / state | ingredientOverlap ("uses Monday's chicken") | `Recycle` |
| Chip / state | favourite | `Heart` (fill) |
| Chip / state | dislike | `ThumbsDown` |
| Chip / state | exclusion | `Prohibit` |
| Chip / state | slotRule | `CalendarCheck` |
| Chip / state | varietyRule | `Shuffle` |
| Chip / state | alreadyInStock | `Package` |
| Chip / state | leftover | `BowlFood` |
| Chip / state | useSoon / goesOff | `HourglassMedium` |
| Chip / state | spoiled | `WarningCircle` |
| Chip / state | pinned | `PushPin` (fill) |
| Chip / state | cooked | `CheckCircle` (fill) |
| Chip / state | advanceStep | `Alarm` |
| Chip / state | passiveStep | `HourglassSimple` |
| Chip / state | activeStep | `Knife` |
| Chip / state | batch | `Stack` |
| Chip / state | portions | `ChartPieSlice` |
| Chip / state | attendance | `UsersThree` |
| Chip / state | tag | `Tag` |
| Chip / state | readyMeal | `Package` |
| Chip / state | duration | `Clock` |
| Feedback | success / info / warning / error | `CheckCircle` / `Info` / `HourglassMedium` / `WarningCircle` |
| Feedback | offline | `CloudSlash` |
| Feedback | streak | `Leaf` |
| Feedback | celebration | `Confetti` |
| Empty state | plan (nothing planned) | `CalendarBlank` |
| Empty state | recipes | `BookOpenText` |
| Empty state | search no results | `MagnifyingGlass` |
| Empty state | shopping list empty / complete | `Confetti` |
| Empty state | stock | `Package` |
| Empty state | leftovers | `BowlFood` |
| Empty state | timers | `Timer` |
| Empty state | ingredients | `Carrot` |
| Empty state | products | `ShoppingBagOpen` |
| Empty state | shops | `Storefront` |
| Empty state | members / meal slots | `UsersThree` / `Clock` |
| Empty state | offline (no cache) | `CloudSlash` |
| Empty state | error | `WarningCircle` |
| Empty state | camera unavailable | `CameraSlash` |

Meal Slot icon resolution: a pure function `mealSlotIcon(name)` in `web/src/ui/lib/` (case-insensitive match on breakfast/lunch/dinner/snack,
otherwise `other`), unit-tested.

---

## 4. Component specs

All live in `web/src/ui/` (shared, serialised by the PM). Each uses the right element and ARIA under the styling. Sizes are CSS px.

### 4.1 Icon
- **API:** `<Icon name: IconName; size?: 14|16|20|22|24|28|64; weight?: 'regular'|'bold'|'fill'|'duotone'; label?: string />`.
- Default weight: `bold` when size ≤ 16, else `regular`. `label` absent → `aria-hidden="true"`; present → `role="img" aria-label`.
- Only `Icon` imports from `ui/icons.ts`. Buttons/Chips/Tiles take `icon: IconName`, not ReactNode, so nobody passes ad-hoc SVG.
- **Don't:** colour icons with props; mix weights in one row except to show selection; use an icon without a text label anywhere except
  IconButton (which needs `aria-label`) and the nav (which shows a label).

### 4.2 Buttons
| Variant | Fill / text | Use | Rule |
|---|---|---|---|
| `primary` | accent / on-accent | the one main action of a screen, tile or sheet (Cook, Save Recipe, Yes Cooked) | max one per tile/sheet |
| `secondary` | surface-2 / text (on a surface); surface / text (on the accent hero) | alternatives (Adjust, Swap in a sheet, Stock-take) | |
| `accent-secondary` | soft / accent-text | positive secondary on surfaces (Scan on the cost tile, Copy prompt) | |
| `tertiary` | transparent / accent-text, underline on hover | low-emphasis (Keep it, Cancel, Not cooked) | never for destructive |
| `danger` | danger solid / white | confirming a destructive dialog only | |
| `danger-tertiary` | transparent / status-danger-fg | Delete / Throw out entry points | opens a confirm dialog |

- **Sizes:** `sm` 36 h, padding 0 14, label 13/700, icon 16, radius 12 (in dense rows only; hit area padded to 44);
  `md` 44 h, padding 0 18, 15/700, icon 20, radius 16; `lg` 52 h, 16/800, icon 22, radius 18; `xl` 64 h, 17/800, radius 20 (Cook Back/Next, board).
  Icon 8 px before label. Full-width inside tiles on phone when it is the tile's primary.
- **States:** hover = overlay `color-mix(in oklab, currentColor 8%, transparent)`; pressed = 12 % + scale .97; focus-visible = 3 px ring
  `--color-accent` with 2 px offset in `--color-bg` (ring never on containers); disabled = 38 % opacity, no hover; loading = spinner replaces icon,
  label stays, `aria-busy`.
- **IconButton:** 40 visual / 44 hit, radius 12, fill surface-2 (or soft when "active"), icon 20; compact 32/16 inside day tiles (hit area still 44
  via pseudo-element). Requires `aria-label`. Toggle variant uses `aria-pressed` and `fill` weight when on.
- **Don't:** two primaries side by side; ghost/tertiary for the only action in a tile; text-only buttons with no fill in a row of filled ones.

### 4.3 Chips (by meaning)
Chips carry **meaning**, never raw facts. Facts (Batch, portions, durations) go in a meta line: `Stack 1 Batch · ChartPieSlice 3.5 portions`.

| Kind | Fill / text | Icon | Example |
|---|---|---|---|
| `why` | soft / accent-text | reason-specific (`Recycle`, `Heart`, `HourglassMedium`, `CalendarCheck`, `Package`, default `Sparkle`) | "uses Monday's chicken" |
| `state` | status container / status fg | `PushPin`, `CheckCircle`, `XCircle` | "Pinned", "Cooked" |
| `status` | status container / status fg | `BowlFood`, `HourglassMedium`, `WarningCircle` | "Leftover from Mon", "Goes off Thu" |
| `tag` | surface-2 / muted | `Tag` (first chip only) | "pasta" |
| `filter` (selectable) | off: surface + 1 px outline / text; on: accent / on-accent + `Check` fill | | "Use soon", "All Tags" |
| `count` | surface-2 / text | none | "+2" overflow |

- **Anatomy:** height 28 (phone) / 32 (filter, tappable, hit area 44) / 40 (board); padding 0 10; gap 6; icon 14 bold; label 12/700 (13/700 filter).
- **Rules:** at most **1** chip per Planned Meal on day tiles, **2** on the hero, **3** in the Planned Meal sheet; overflow → `count` chip.
  One wrapping row (`flex-wrap`, gap 6). On the accent hero, why chips use surface / accent-text (mockup).
- **Don't:** use chips as buttons except `filter`; show a status by colour only; repeat a reason already shown as a state chip.

### 4.4 Bento tiles
`Tile` becomes a layout container only, **never a `<button>`**. Clickable tiles render `<article>` with a full-bleed `<a>`/`<button>` "stretched
link" for the primary target, so inner buttons still work and content stays top-aligned.

| Variant | Fill | Use |
|---|---|---|
| `hero` | accent / on-accent, radius 28 | Tonight on Today, hero on board, "left to get" metric |
| `surface` (default) | surface + elev-1 | day tiles, lists, facts |
| `soft` | soft / text, accent-text overline | streak, timers, celebration |
| `status-*` | status container / text, overline in status fg | Leftovers, Use soon, Throw out or keep?, couldn't plan |
| `metric` | any of the above + `display` number + label | "14 left to get", "€38.40", "3 wk" |
| `media` | surface with a photo header (16:9, radius inherits, `object-fit: cover`) | Recipe tiles |
| `action` | primary/secondary button styling at tile size | Cook Back/Next, board Cook |

- **Anatomy:** overline (12/800, optional 16 px icon) → title (18/800 or body-strong) → body/meta → chips → actions (bottom, `margin-top: auto`).
- **Spans:** `span="1" | "2" | "full"`, rows `rowSpan` (board only). **Remove every fixed `min-height`**; height = content, and
  `grid-auto-rows: auto` with `align-items: stretch` so tiles in one row match the tallest *of that row*, content top-aligned.
- **Padding:** 16 / 20 / 26 (phone / tablet / board). Radius 24 (20 for compact list tiles; 32 on board).
- **Don't:** nest tiles in tiles; put two `hero` tiles on one screen; use status fills for decoration.

### 4.5 Navigation
- **Phone bottom bar (mockup):** floating bar inset 12 px from left/right/bottom (+ `env(safe-area-inset-bottom)`), height 70, radius 24,
  surface + elev-2 (dark: surface-2 + hairline). Four items 62×54, radius 16: icon 24 over label 11/800, 2 px gap.
  Inactive: muted, `regular`. **Active: soft pill fill, accent-text, icon `fill` weight, `aria-current="page"`.**
  Scan: 58×58, radius 20, accent fill, `Barcode` 28 on-accent, not translated upward (it sits in the bar, as in the mockup); on `/scan` it gets a
  3 px soft ring. Max width 480, centred on tablets in portrait.
- **Content clearance:** `.app-main` bottom padding = `70 + 12 + 16 + env(safe-area-inset-bottom)` = 98 px + safe area. Sticky bottom action bars
  sit above the nav (same offset).
- **Top bar:** title row belongs to each screen (`PageHeader`: overline date + `title-1`, optional trailing actions); the brand word "Feeder" is
  dropped on phone (the avatar stays top-right, 40 px, radius 14 square-ish as in the mockup, opening the avatar menu).
- **Avatar menu:** popover 240 wide, radius 20, elev-2; rows 48 h with 20 px icon + label; group divider before Settings; Sign out last in
  danger-tertiary text. Focus goes to the first item, not a highlighted Sign out.
- **Tablet landscape / desktop (≥ 1024):** side **rail** 88 wide: icon 24 + label 12/800 stacked, active = soft pill 56×32 behind the icon (Material
  rail pattern), Scan as an accent 56 square at the top. ≥ 1440: expanded 240 rail with icon + label rows. The chromeless routes (board, Cook Mode)
  must not inherit the rail grid (fix `.app-shell--chromeless { display:block }`).

### 4.6 Dialog (and ConfirmDialog)
- Built on `<dialog>` with `showModal()`; `::backdrop` = scrim; closes on Esc and backdrop click (except destructive confirms).
- **Anatomy:** optional 48 px status icon circle → title `title-2` → body 15/22 muted (max 2 short paragraphs) → actions right-aligned
  (tertiary Cancel, then primary or danger). Width min(400, 100vw − 32), padding 24, radius 28, elev-3, enter 240 ms scale .96 → 1 + fade.
- `ConfirmDialog` replaces `window.confirm`: `confirm({ title, body, confirmLabel, tone: 'danger'|'default' }) → Promise<boolean>` via a hook
  (`useConfirm`). Recipe delete: "Delete Chicken tikka traybake?" / "It is removed from future Planned Meals. Archive keeps it for history." /
  [Cancel] [Archive instead] [Delete].
- Initial focus: the least destructive action. Focus returns to the trigger on close.

### 4.7 Bottom sheet
- Also a `<dialog>` (phone presentation of a dialog). Radius 28 top, grab handle 36×4 surface-3 centred 8 px from top, padding 20 + safe area,
  max-height 85 dvh, internal scroll, sticky footer for actions. Title `title-2` with a close `IconButton` top-right. ≥ 768: renders as a centred dialog.
- **Fix:** don't focus the container (it draws the green ring); focus the first interactive element or the title with `tabindex=-1` and no outline.

### 4.8 Toast
- Region bottom-centre, above the nav (`bottom: 98px + safe area`), max-width 420, stack max 2.
- **Anatomy:** inverse surface (`--color-text` bg, `--color-bg` text), radius 16, padding 12 16, leading 20 px status icon (success `CheckCircle`
  in `#a7e2b2`, error `WarningCircle` in `#febfb9`), message 15/600, optional action as tertiary in `--color-soft` ("Undo"), close `X`.
- Timing 4 s, 6 s with an action, errors stay until dismissed. `role="status"` (errors `role="alert"`). Swipe down to dismiss.
- **Don't:** use toasts for anything that needs a decision (use a dialog) or as the only record of an error on a form (inline too).

### 4.9 Rich select (`Select`)
- Replaces every `<select>`. **Trigger** looks like a field: 48 h, radius 14, surface-2 fill, 1.5 px outline border, optional leading 32 thumb/icon,
  value 15/600 (placeholder muted), trailing `CaretUpDown` 20. Label above (13/700), helper/error below.
- **Popover:** ≥ 768 a 360-wide listbox under the trigger (max 420 h); phone a bottom sheet. Optional search field at top (auto-focused when > 8
  options), optional filter chips row and sort `IconButton`, grouped sections with sticky subheaders (overline). **Option row** 56 h:
  40 thumb (Recipe photo or generated art; Ingredient → Base Unit badge; Shop → `Storefront`; Member → avatar), title 15/700, meta 13 muted,
  trailing `Check` fill for the selected one. Empty search → inline "No Recipe matches 'xyz'" with a "Create" row where allowed.
- **A11y:** trigger `role="combobox" aria-expanded aria-controls`, list `role="listbox"`, options `role="option" aria-selected`; arrows, Home/End,
  type-ahead, Enter selects, Esc closes.
- Variants by use: `RecipeSelect` (thumbs, Tags filter, sort by name / last cooked), `IngredientSelect` (search, Base Unit meta, "Create
  Ingredient"), `UnitSelect` (grouped: Base Unit, Unit Conversions, global units), `ShopSelect`, `MealSlotSelect` (grouped by weekday, slot icon),
  `MemberSelect` (multi, avatars).

### 4.10 Form fields
`TextField`, `TextArea`, `NumberField` (with `Stepper` ±, tabular, unit suffix), `TimeField` (24 h, hh:mm segments, follows the Household
locale, never the browser's AM/PM), `DateField` (field + calendar popover, week starts Monday), `Checkbox` (22 px, radius 6, 2 px outline →
accent fill + `Check` bold), `Switch` (52×32, for on/off settings such as the notification toggles), `RadioCards` / `Segmented` (Light · Dark · System;
Metric · Imperial), `Slider` (Planner Style: 3 labelled stops, 6 px track soft-strong, 24 px thumb accent), `ColorSwatches` (accent presets as
40 px circles + "Custom" opening a crafted picker), `FileDrop` (dashed outline zone, `FileArrowUp`, "Choose a file or drop it here").
Shared anatomy: label 13/700 above, 48 h control, helper 13 muted, error 13 status-danger-fg with `WarningCircle` 14, `aria-describedby`.

### 4.11 Empty states
- Inside the tile/region that is empty (not a full-page takeover unless the whole screen is empty).
- **Anatomy:** 96 soft circle with a 64 duotone icon → title 20/800 → one line 15 muted (max 34ch) → optional primary action.
- Copy is witty but useful (brief): Plan "The week is wide open" / "Add Meal Slots and a few Recipes, and Feeder fills it in." [Open Settings];
  Shopping List complete "Basket complete!" with a celebration and cost summary; Leftovers "No Leftovers waiting. Clean fridge energy.";
  Timers "No timers running"; Stock "Nothing in Stock yet" [Add to Stock] [Stock-take].
- **Never show an empty state for an error or offline** (section 4.14).

### 4.12 Timer tile
- `soft` tile, overline label (12/800, e.g. "RICE"), time `display` 34/800 tabular (`mm:ss`, `h:mm:ss` over an hour), 4 px progress ring or bar
  (soft-strong track, accent fill). Controls as 32 px icon buttons: Pause/Play, +1 min, X.
- States: running (soft), paused (surface-2, `Pause` overline icon, time muted), finished (success container, `Bell` icon, 2 × 120 ms pulse, then
  static; vibration on phone), overdue (spoil container, counts up with "+").
- Board: ×1.75 type, no controls.

### 4.13 List rows (`ListRow`)
- Heights 56 (single line) / 64 (two lines) / 72 (with 48 thumb). Padding 0 16. Leading: 40 tinted square (radius 12, soft fill, 24 icon accent-text)
  or thumb/avatar. Title body-strong, meta 13 muted, trailing value (tabular, right-aligned) or chevron `CaretRight` or one IconButton.
- Whole row is the tap target (`<a>`/`<button>`), hover surface-2, pressed surface-3. Dividers: 1 px line, inset to the text start (72 px).
- Groups sit in a `surface` tile with radius 20 and no inner padding (rows carry their own).

### 4.14 Status surfaces: offline, error, loading
- **OfflineBanner** (in the shell, under the top bar): 40 h pill, surface-2, `CloudSlash` 16, "Offline · showing what was saved at 14:02",
  plus "3 Scans waiting to sync" when the queue is non-empty. Polite live region.
- **ErrorState** (inline in the region): danger status tile, `WarningCircle`, "The plan could not be loaded." + [Try again]. Hooks must expose
  `status: 'loading'|'error'|'offline'|'empty'|'ready'` so components never infer "empty" from a failed request.
- **Skeleton**: tile-shaped blocks in surface-2 with a 1.2 s shimmer (disabled with reduced motion), shown after 300 ms.
- **Boot**: `index.html` paints the background colour and a centred Feeder mark immediately (inline critical CSS), so a slow load is never white.

### 4.15 Thumbs and Recipe art
- `RecipeThumb` sizes 40 / 48 / 72 / hero (16:9). `<img>` always `width:100%; height:100%; object-fit: cover; display:block`.
- No photo → **generated tile** (brief): soft fill from the accent, the first Tag's icon (Phosphor, mapped by `tagIcon()`: pasta → `BowlSteam`,
  fish → `Fish`, chicken → `Bird`, pizza → `Pizza`, soup → `BowlFood`, vegetarian → `Leaf`, default `ForkKnife`) in accent-text at 40 %, and the initial
  in title-3. Replaces the current bare "C" / "L" letters on the Recipes grid.

---

## 5. Screen-by-screen redlines

Screenshot paths are relative to the worktree root.

### 5.1 Today (`/`) — `build/ui-review/phone-light-today.png`, `phone-dark-today-menu.png`, `phone-light-offline-today.png`
**Problems:** double horizontal padding (tile edge at x = 32 instead of 16: `.today` adds 16 px inside `.app-shell`'s 16); Next Planned Meal is a
`<button>` tile whose content is vertically centred in a 450 px stretched cell; "Throw out or keep?" outranks dinner; Throw out (tonal) / Keep
(text) buttons wrap to 2 lines in a half-width tile; "feta200 gWent off 2 days ago" run-on text; bullets; streak text clipped ("21 days without
throwing food away" overflows the tile behind the nav); no Cook action, no photo, no start time; dark mode keeps light pink status tiles.

**Hierarchy:** 1 Tonight hero → 2 To confirm (if any) → 3 Advance Step due / Leftovers to use (half + half) → 4 Use soon / streak (half + half) →
5 Throw out or keep? (full, status-danger) → 6 Couldn't plan (full, status-danger). Scan session active → Shopping List (spec).

**Layout:** `PageHeader` overline "TUE 10 NOV", title "Today". Bento 2 columns, gap 10. Hero full width, accent, padding 18, radius 28:
overline row (slot icon + "DINNER · 19:30" left, "start 18:45" right), Recipe name 26/800, 2 why chips, primary-on-accent button "Cook · 45 min"
(46 h, surface fill, text colour). Half tiles content-height; Advance Step tile: `Alarm` 22 accent-text, time `display`-small 24/800,
text 13 muted. Leftovers tile: status-leftover, overline "LUNCH · LEFTOVER". Use soon: status-spoil, max 3 rows "Spinach · Thu", then "+2 more".
Streak: soft, "3 wk" 34/800 accent-text + "zero-waste streak" 13/700 (shorten the sentence). Throw out or keep?: rows = Ingredient 15/700,
"200 g · went off 2 days ago" 13 muted, trailing [Keep] secondary sm + [Throw out] danger-tertiary sm.

### 5.2 Plan (`/plan`) — `phone-light-plan.png`, `phone-dark-plan.png`, `tablet-820-today.png` (shows Plan at 820), `desktop-1280-plan.png`
**Problems:** all of the user's list, confirmed: chips 1.00:1 against the tile (on narrow tiles they look like loose text); "Swap", "Confirm" are
unstyled text; "Mark as Cooked" tonal = tile colour on Today's tile; 3 buttons stack vertically in half tiles (each meal ~400 px tall); actions on
future days; why chips duplicate the state ("Leftover from Tuesday" + "leftover from Tue"); vague reasons ("best available", "already in Stock");
"2 Batches" of a 2-portion Ready Meal reads as an error; divider between meals uses `--color-outline` at full strength; Regenerate is a pale pill
with no icon or confirmation; nav covers the second row; 2 columns even at 1280.

**Hierarchy:** week range → Today (2 cols, ring) → each day: date overline → Planned Meals (slot, Recipe, one chip, swap) → tap for details.

**Layout:** header "Plan" + overline "9 – 15 NOV" + trailing secondary sm "Regenerate" (`ArrowsClockwise`). Grid: phone 2 / tablet 4 / desktop 7
columns, gap 10/12/16. Day tile padding 14, radius 22, gap 10 between Planned Meals (no divider lines; a 1 px line only at ≥ 3 meals).
Planned Meal block: row 1 = slot icon 14 + "Lunch" 11/700 muted, trailing compact IconButton swap (32); row 2 = Recipe name 14/800 (2-line clamp);
row 3 = one chip. Unfilled slot = dashed block with `danger` chip "Couldn't plan" + "Choose a Recipe" tertiary. Planned Meal sheet holds the
rest (facts meta line, Attendance avatars, all chips, actions ordered Cook (primary, today only) · Mark as Cooked (today/past) · Swap · Pin · Choose a Recipe).

### 5.3 Swap sheet — `phone-light-plan-swap-sheet.png`
**Problems:** focus ring on the sheet container; one alternative; no thumbs; per-alternative "Swap" tonal button plus "Close" text; `+0.5 Leftover`
chip not leftover-coloured (tone CSS missing). **Fix:** section 2.3 and 4.7; rows are the buttons.

### 5.4 Mark as Cooked sheet — not captured (opened via code review: `MarkCookedSheet.tsx`)
Native number input for Leftover portions → `Stepper` (±0.5, 44 px buttons) with "Use by Thu" meta from `leftoverUseBy`; primary "Mark as Cooked"
full width in the sticky footer; secondary "No Leftover" sets 0.

### 5.5 Shop (`/shop`) — `phone-light-shop.png`, `phone-light-loading-shop.png`
**Problems:** progress bar empty and colourless at 0; "Lines ticked 0 / 22" is not the user's question; "—" under every line and in the cost tile;
7 range chips wrap to 2 lines; tick control ~16×6 px pill (unstyled `.line-tile__check`); 130 px tiles for one Ingredient line; lower-case
names; extras show a bare "×"; "Add an extra" is the last element (after 3,000 px); blank while loading/offline.

**Hierarchy:** how many left + est. total → [Scan] → unticked lines → ticked lines → extras.

**Layout:** header "Shop" + `Select` "Until Mon 16" + `IconButton` add extra (`Plus`). Metric tiles (hero "14 left to get"; surface "€38.40 est. at Coop"
with accent-secondary "Scan" sm). Item tiles per mockup (96 min-h, padding 14, quantity 18/800 + check 22, name 14/700, pack 11 muted:
"1 × Mutti passata 700 g"; no "—" ever: missing price shows nothing). Extras use `NotePencil` and a `X` IconButton 32. Completion → celebration tile.

### 5.6 Scan (`/scan`) — `phone-light-scan.png`
**Problems:** shop tiles 160 px tall; Stock-take as a tonal pill under them; nothing indicates the last-used Shop. Camera/viewfinder, unknown-barcode
sheet and weight prompt could not be exercised (no camera in the review browser).
**Layout:** title "Where are you shopping?", `ListRow`s 64 h (`Storefront`, name, meta "last visit Sat"), last-used first with a `Check`;
"Stock-take at home" as the final row with `HouseLine`. Scanning: viewfinder strip per mockup, torch IconButton, live list beneath with ticked lines
sliding away; unknown barcode → bottom sheet with `IngredientSelect` and `RadioCards` (replaces native radios).

### 5.7 Stock (`/stock`) — `phone-light-stock.png`, `phone-light-offline-stock.png`
**Problems:** run-on strings ("feta200 g1 Stock Lot", "eggs4 pieces1 Stock Lot"); whole tiles painted spoil-pink for "use soon"; "Use soon" chip
in accent tone on a pink tile; 140 px tiles for one line; offline shows "Nothing in Stock yet". **Layout:** section 2.6. Rows: name, "4 pieces"
trailing, meta "1 Stock Lot · goes off Thu" (spoil fg + `HourglassMedium` 14 when due). Tap row → Stock Lot sheet (Lots list, Set total, Throw out).

### 5.8 Recipes (`/recipes`) — `phone-light-recipes.png`
**Problems:** photos overflow (no `object-fit`/`max-width`; page 861 px wide at 390); native search input with a floating label; four equal pills
(Show archived, New Recipe, Import, Export, Copy Agent Prompt); 13 Tag chips over 3 lines; name and time concatenated ("Chicken & leek pie45 min");
no-photo Recipes show a bare initial. **Layout:** header "Recipes" + primary sm "New Recipe" (`Plus`) + overflow (Import, Export, Copy Agent Prompt,
Show archived). Search field with `MagnifyingGlass`, then one horizontally scrolling filter chip row (Tags) with fade edges. Grid of `media` tiles
2/3/4 cols: 4:3 photo or generated art, name 15/800 (2-line clamp), meta row `Clock` "45 min" · `Alarm` "+4 h ahead" chip.

### 5.9 Recipe detail (`/recipes/:id`) — `phone-light-recipe-detail.png`
**Problems:** photo overflows to 656 px; "Total 25 min" excludes the 4 h Advance Step without saying so; "Yield 4" (correct term, needs a unit);
Advance Steps tile uses the leftover yellow; bullet lists; Edit/Archive/Delete at equal weight at the very bottom, Delete via `window.confirm`;
no "Cook" entry. **Layout (mockup):** hero media tile 170 h with name over a gradient scrim (photo) or generated art; metric tiles "4 portions per
Batch" and "45′ · + 4 h marinate ahead"; Ingredients tile as a 2-column quantity/name grid; Steps as numbered rows (30 px soft number badge, text
14/600, meta "Passive · 15 min" with icon); Preferences (Favourite / Dislike / Exclusion as a `Segmented` with icons) for linked Users; primary
"Start Cook Mode" sticky above the nav; Edit in the header (`PencilSimple` IconButton); Archive/Delete in the overflow, Delete via ConfirmDialog.

### 5.10 Recipe editor (`/recipes/:id/edit`, `/recipes/new`) — `phone-light-recipe-edit.png`
**Problems:** an unstyled HTML form (inline labels, 10 px default inputs, native selects/checkboxes/file input, "optionalNote" run-on), 5,600 px tall.
**Layout:** sections as tiles (Details, Photo, Ingredients, Steps, Planning) with field primitives; Ingredient lines as rows (`IngredientSelect`,
`NumberField` + `UnitSelect`, note, optional `Checkbox`, drag handle, remove IconButton); Steps as cards with `Segmented` kind (Active · Passive ·
Advance), duration/lead `NumberField` with unit, "After" as filter chips; sticky footer [Cancel tertiary] [Save Recipe primary].

### 5.11 Import / Export (`/recipes/import`, `/recipes/export`) — `phone-light-import.png`
Native file input and textarea; see 2.8. Export: `RecipeSelect` multi with thumbs + "All Recipes" switch, primary "Export Recipe File".

### 5.12 Cook Mode (`/cook/...`) — `phone-light-cook.png`; desktop collapse visible in `board-1280-light.png` (same shell bug)
See 2.7. Also: the step counter says "Step 1 of 4" while the Recipe has 5 Steps (Advance Step excluded from count, but listed above): label it
"Step 1 of 4 · Advance Step done ✓" or count consistently. Tap zones: left/right halves get a 1-time coach mark ("Tap right for next").

### 5.13 Kitchen board (`/board`) — `board-1280-light.png`
**Problems:** collapsed into a 220 px column (chromeless shell inherits `grid-template-columns: 220px 1fr`): overlapping 9 rem clock, unreadable
tiles; a coordinate hint ("Add coordinates in Settings so the board follows the sunset") sits on the wall display. **Layout (mockup 4×3):**
Tonight hero 2×2 (accent, 52/800 name, chips, Cook 76 h), clock tile (76/800), Prep ahead, Leftovers (status-leftover), Timers (soft),
Use soon 2×1 (status-spoil), Tomorrow, streak. Padding 24, gap 16, radius 32. The coordinate hint moves to Settings.

### 5.14 Settings (`/settings` and sub-pages) — `phone-light-settings.png`
**Problems:** one 10,800 px page; native time (12 h AM/PM), number, range, color, checkbox, radio, select; member avatars all accent green while
the Member colour is a tiny dot; Meal Slot list repeats "Edit / Change a date" text buttons 11 times; links (Shops, Planning rules, Notifications)
are underlined text. **Layout:** Settings index = grouped `ListRow`s with icons (Household, Members, Meal Slots, Planning rules, Shops, Barcodes,
Notifications, Allowlist, Your preferences); each opens its own page. Members: rows with avatar ringed in Member colour, Portion Factor trailing.
Meal Slots: week view (7 rows, slot chips with icon and time), tap → MealSlot sheet (`TimeField`, `MemberSelect` with Portion Factor overrides).
Preferences: `Segmented` scheme/units, `ColorSwatches` accent with live preview tile.

### 5.15 Ingredients, Products, Shops — `phone-light-ingredients.png`
**Problems:** list bullets visible, native search, Base Unit and Shelf Life as loose bold words. **Layout:** search + `ListRow`s: name, meta
"g · keeps 3 days", chevron; detail pages as section tiles. Products: rows with `Barcode` meta and latest Price trailing; Shops: rows with
`Storefront`. (Product and Shop detail screens were not captured; apply the same row/field primitives.)

### 5.16 Sign-in — `phone-light-signin.png`
Acceptable structure; add the Feeder mark, Google "G" button per Google's brand guidance (white button, outline), and centre at max-width 400.

### 5.17 Avatar menu — `phone-dark-today-menu.png`
No icons; Sign out highlighted as if selected on open; menu covers content without a scrim. Spec in 4.5.

---

## 6. Copy fixes (against GLOSSARY.md)

| Where | Now | Change to | Why |
|---|---|---|---|
| Plan, Planned Meal | "Leftover from Tuesday" chip **and** why chip "leftover from Tue" | one `leftover` chip "Leftover from Tue" | duplicate; one style for weekdays (short, title case) |
| Plan, why chips | "leftovers for Wed" / "Leftover from Tuesday" / "+0.5 Leftover" | "Leftover for Wed", "Leftover from Tue", "+0.5 portion Leftover" | glossary term is **Leftover**, capitalised; consistent singular |
| Plan, why chips | "already in Stock" | "uses Stock: chicken thighs" (name the Ingredient) | brief: "uses Monday's chicken" specificity |
| Plan, why chips | "best available" | drop the chip (no reason is better than a non-reason) | says nothing |
| Plan, why chips | "chicken thighs goes off Wed" | "uses chicken thighs before Wed" | frames the reason, not the spoilage |
| Plan, action | "Confirm" | "Pin" (state chip "Pinned") | glossary **Pinned**; avoids clash with "confirm it was Cooked" |
| Plan, facts | "1 Batch" chip, "2 Batches" for a Ready Meal | meta line "1 Batch · 3.5 portions"; for a Ready Meal "2 packs" is wrong too: "2 Batches (2 packs)" | facts aren't chips; clarify Ready Meal |
| Plan / Cook | "Not cooked" state + `skipped` in code; Cook: "This meal has already been cooked or skipped" | "This Planned Meal is already Cooked or marked Not cooked" | **meal** is an _Avoid_ word; "skipped" is not a glossary term |
| Today | "Next Planned Meal" | overline "DINNER · 19:30" (the slot) | the slot is the useful label |
| Today | "21 days without throwing food away" | "3 wk zero-waste streak" (number + label) | fits a half tile; brief wording |
| Today / Stock | "feta200 gWent off 2 days ago" | "Feta · 200 g · went off 2 days ago" | separators; sentence-case Ingredient |
| Stock | "1 Stock Lot" appended to quantity | meta "1 Stock Lot" on its own line | layout, glossary ok |
| Shop | "Lines ticked 0 / 22" | "22 left to get" (and "Basket complete!" at 0) | the user's question |
| Shop | "Estimated cost", cost tile | "Est. total" / "€38.40 est. at Coop" | **Cost** is an _Avoid_ word (use Price/total) |
| Shop | "19 without a price" | "19 lines have no Price yet" | glossary **Price** |
| Shop | "Add an extra" | "Add to Shopping List" | clearer; "extras" is internal |
| Recipes | "Yield 4" | "4 portions per Batch" | glossary defines Yield that way; readable |
| Recipes | "Total 25 min" (excludes Advance Steps) | "45 min · +4 h ahead" | honest total |
| Recipes | "+4 h advance" chip | "+4 h ahead" with `Alarm` | shorter, consistent with Cook |
| Cook | 'Mark "Marinate the chicken in yogurt and spices." as done' | "Done" (button) beside the step text | long button label; "done" fine for Advance Steps but keep it short |
| Cook | "Voice commands off" / "Screen stays awake" chips | voice toggle IconButton with aria-label "Voice commands"; drop the keep-awake chip | not chips |
| Board | "Done" (Advance Step) | "Done" stays, but never for a Planned Meal (use "Cooked") | _Avoid_ "Done" applies to **Cooked** |
| Board | "Add coordinates in Settings so the board follows the sunset" | move to Settings › Household helper | wall display copy |
| Swap sheet | "Swap this Planned Meal" / "The best alternatives under the same scoring" | "Swap for…" / (no subtitle) | brief, mockup |
| Settings | "Portion Factor 1.25" inline | trailing "×1.25" with label "Portion Factor" in the sheet | density |
| Settings | 12 h times "10:00 PM" | 24 h "22:00" | Household locale |
| Ingredients | lower-case names everywhere | display with first letter capitalised | sentence case UI |

Run a glossary lint (section 7) over every `strings.ts` for _Avoid_ words: found today "meal" (cook), "cost" (shop), "Item code" (shops: OK as a
barcode technical term, add to an allowlist).

---

## 7. Implementation plan for the build teams

Order: **guards → tokens → icons → primitives → shell → screens**. `web/src/ui/*`, `web/src/theme/*`, `web/src/app/*`, `web/src/styles.css`,
`web/package.json`/lockfile are shared files: the PM serialises them. Feature folders can then run in parallel.

### WP0 Guards (first, small; one team) — touches `scripts/check.sh`, new `scripts/check-ui.sh`, `scripts/test/check-ui_test.sh`
- `check-ui.sh` (run by `check.sh`, output into `build/check.log`), grep-based so it needs no new dependency:
  1. no `<select`, `window.alert|confirm|prompt` or bare `confirm(`/`alert(`, no `<input type="(checkbox|radio|date|time|number|range|color|file)"`
     outside `web/src/ui/`;
  2. `@phosphor-icons/react` imported only in `web/src/ui/icons.ts`, and only via `/dist/csr/<Name>` paths;
  3. no hex/rgb colour literals in `web/src/features/**/*.css` and components (only `var(--…)`);
  4. **every `className` token used in `.tsx` has a CSS rule** (the 96 gaps found here), with an allowlist file for intentional hooks;
  5. no `min-height` on `.tile` variants; no `px` font sizes outside the token file.
  6. glossary lint: _Avoid_ words from GLOSSARY.md (parsed) in `strings.ts`, with an allowlist (`scripts/check-ui.allow-glossary`, one `path word  # reason` per line; matches the whole file).
  7. `native-search` (warn): no `<input type="search">` outside `web/src/ui/` (use the styled `SearchField` primitive).
  Requires **bash 4+** (associative arrays; macOS ships 3.2, so install a newer bash there). `--root`/`--rules` without a value exit 2 with a usage
  message; a `fail_paths` prefix works with or without a trailing slash.
  Start it in **warn** mode listing violations; flip each rule to **fail** when the WP that fixes it merges.
- vitest `theme/contrast.test.ts` extended (skipped only while the old palette is in place; once any Bento-only key exists, all keys must, or it fails): for all 7 presets × light/dark, assert the pair table in 3.1 (text ≥ 4.5, controls ≥ 3).
- **Acceptance:** `make check` prints the current violation counts; the shell test covers each rule with a passing and failing fixture.

### WP1 Tokens and theme (one team) — `web/src/theme/{color.ts,palette.ts,apply.ts,contrast.ts}` + tests, `web/src/styles.css` (`:root` token block only)
- Add OKLCH conversion in `color.ts`; rewrite `generatePalette` to the tone table in 3.1; new token names (`bg, surface, surface-2, surface-3, line,
  outline, text, muted, accent, on-accent, accent-text, soft, soft-strong`) and status tokens per scheme; keep old CSS variable names as aliases for
  one release so screens don't break.
- Type, spacing, radius, elevation, motion tokens as CSS custom properties in `styles.css`; Figtree 800 added (`@fontsource/figtree/800.css`).
- **Acceptance:** palette tests for all presets/schemes pass the 3.1 table; Basil light/dark hexes match the table ±1 per channel;
  no other file changes; screenshots of Plan show white tiles on a tinted ground.

### WP2 Icon wrapper (one team; after WP1 or in parallel, it touches different files except `package.json`) — `web/package.json`, lockfile, `web/src/ui/icons.ts`, `web/src/ui/Icon.tsx`, `web/src/ui/lib/mealSlotIcon.ts`, `web/src/ui/lib/tagIcon.ts`, tests
- Add `@phosphor-icons/react`; register every icon in 3.4; `Icon` per 4.1; pure helpers with unit tests.
- **Acceptance:** guard rule 2 fails on any other import; the production bundle contains only the registered icons (each `csr` glyph module carries all six weights, so the ~90 icons
  must add less than 64 kB gz to `dist`; measure the delta); `Icon` tests cover default weight by size and aria.

### WP3 Primitives A: actions, chips, tiles, layout (one team; serial with WP4 on `ui/index.ts` and `styles.css`) — `ui/Button.tsx`, new `ui/IconButton.tsx`, `ui/Chip.tsx`, `ui/WhyChip.tsx`, `ui/Tile.tsx`, `ui/BentoGrid.tsx`, new `ui/PageHeader.tsx`, `ui/ProgressTile.tsx`, `ui/TimerTile.tsx`, new `ui/ListRow.tsx`, new `ui/RecipeThumb.tsx`, `ui/EmptyState.tsx`, CSS moved to `ui/*.css` per component
- Variants and states from 4.2–4.4, 4.11–4.13, 4.15. `Tile` never renders `<button>`; add `stretched` link pattern. `Chip kind` replaces `tone`
  (`why|state|status|tag|filter|count`) with `status` prop for colour.
- **Acceptance:** a `ui/Gallery` dev route (behind `import.meta.env.DEV`) renders every variant × state in light/dark; unit tests for Tile not being a
  button, Chip kinds mapping to tokens, Button single-primary dev warning; guard rule 4 passes for `ui/`.

### WP4 Primitives B: overlays and forms (one team, after WP3 merges `index.ts`) — new `ui/Dialog.tsx`, `ui/ConfirmDialog.tsx` + `useConfirm`, `ui/BottomSheet.tsx` (rebuilt on `<dialog>`), `ui/Toast.tsx`, `ui/Select/*` (Select, RecipeSelect, IngredientSelect, UnitSelect, ShopSelect, MealSlotSelect, MemberSelect), `ui/fields/*` (TextField, TextArea, NumberField, TimeField, DateField, Checkbox, Switch, Segmented, RadioCards, Slider, ColorSwatches, FileDrop), `ui/Stepper.tsx`, `ui/OfflineBanner.tsx`, `ui/Skeleton.tsx`, `ui/ErrorState.tsx`
- Specs 4.6–4.10, 4.14. Domain-specific selects take data and callbacks via props (no fetching inside `ui/`).
- **Acceptance:** keyboard tests (Tab/Esc/arrows/type-ahead) with testing-library; `<dialog>` used for Dialog and BottomSheet; `TimeField` renders
  24 h; focus returns to trigger; no native control in `ui/` except inside the primitive's own implementation (visually replaced).

### WP5 Shell (one team; after WP2+WP3) — `web/src/app/AppShell.tsx`, `app/nav.ts` (add `icon: IconName`), `app/strings.ts`, shell CSS
- Bottom bar and rail per 4.5; chromeless fix; bottom clearance with safe area; avatar menu with icons; OfflineBanner slot; boot paint in
  `web/index.html`.
- **Acceptance:** at 390/820/1280 no element is hidden behind the nav when scrolled to the end; `/board` and `/cook/*` use the full viewport ≥ 900;
  `document.documentElement.scrollWidth === innerWidth` on every route; active tab has `aria-current` and `fill` icon.

### WP6–WP11 Screens (parallel teams after WP5; each owns its feature folders only)
| WP | Team owns | Redlines | Key acceptance |
|---|---|---|---|
| WP6 Plan + Today | `features/plan/**`, `features/today/**` | 5.1–5.4, 2.1–2.4 | ≤ 1 chip per Planned Meal on day tiles; Mark as Cooked only today/past; Plan 2/4/7 columns; Today hero first; copy rows from section 6 |
| WP7 Shop + Scan | `features/shop/**`, `features/scan/**` | 5.5–5.6, 2.5 | tick target ≥ 44 px; no "—"; offline shows cached list + banner; range as Select |
| WP8 Stock | `features/stock/**` | 5.7, 2.6 | ListRows with separators; status hooks distinguish offline/error/empty |
| WP9 Recipes + Import | `features/recipes/**`, `features/import/**` | 5.8–5.11, 2.8 | no horizontal overflow; ConfirmDialog for delete; editor uses only field primitives |
| WP10 Cook + Board | `features/cook/**`, `features/board/**` | 5.12–5.13, 2.7 | board 4×3 at 1280×800 with no overlap; Cook Exit present; timers as TimerTiles |
| WP11 Settings + catalogue | `features/settings/**`, `features/ingredients/**`, `features/products/**`, `features/shops/**`, `features/notifications/**`, `features/signin/**` | 5.14–5.17 | Settings index + sub-pages; zero native controls; Member colour on avatars |

No two screen teams share files. Each screen WP also deletes its feature's now-unused CSS classes and flips guard rules to *fail* for its folders.

### Verification for every screen WP
- Screenshots at 390×844, 820×1180, 1280×800, light and dark, plus offline, saved to `<worktree>/build/ui-review/` and attached to the Reviewer's
  hand-off; compared against the Bento-Phone / Bento-Tablet artboards.
- `lighthouse`/axe accessibility run on the screen: no contrast failures, all icon buttons labelled.
- Long-name seed (the "Chickpea & coconut curry … very long name" Recipe, "Lucia Maria Bernadette") renders without overflow (2-line clamps).

### Not reviewed (needs follow-up)
Camera scanning flow (viewfinder, unknown barcode sheet, weight prompt, torch) — no camera in the review browser; Stock-take sheet; Product and
Shop detail pages; Planning rules and Notifications sub-pages; Export screen; the Mark as Cooked sheet visually (reviewed in code only);
Cook Mode with running timers and voice; Web Push prompts; a truly empty Household (first run) — the seed always had data, so first-run empty
states were reviewed from code (`EmptyState`, strings) only.
