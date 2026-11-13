# Feeder design system: the rules

These rules carry out the Bento direction of the [UX brief](ux-brief.md). They hold for **every accent theme**, in **light and dark**. The architectural choice behind them is [ADR 0016](../adr/0016-design-system-rules-enforced.md): grids sized by a minimum tile width, and rules enforced by guards. Domain words come from [GLOSSARY.md](../../GLOSSARY.md).

**Where the rules come from.** They were written after the beta.5 iPad review. The user found Shop, Today and Plan "a mess: no use of colors, all different sizes, bad typesetting, misaligned and unorganized".

**What to do with them.**
- Every screen follows them.
- A screen that has not been redone yet may break them, but only where the guard's warn list still allows it (see [Enforcement](#10-enforcement)).
- The shared primitives in `web/src/ui` implement them. Features compose those primitives and add no type, colour or spacing of their own.

## 1. Type: roles, not sizes

Feature CSS never sets a `font-size` other than a `--text-*` token. Muted text uses `--color-muted`, never `opacity`.

| Token | Size / line, weight | Used for, and only for |
|---|---|---|
| `display` | 34/38, 800 | One metric per screen (Shop's "16 of 18 left"), the board clock |
| `title-1` | 28/32, 800 | The page title; the hero Recipe name when the hero is at least 520 px wide |
| `title-2` | 22/26, 800 | The hero name on a phone, an estimated total, a metric on a phone |
| `title-3` | 18/22, 800 | Tile and section titles ("To confirm", "To get"), the day name in Plan |
| `body-strong` | 15/20, 700 | Row titles (Ingredient, Recipe, Stock Lot and Course names), buttons, quantities (tabular numerals) |
| `body` | 15/22, 500 | Sentences: notices, descriptions |
| `meta` | 13/18, 500–600 | The second line of a row, hints, captions, Course labels, slot times |
| `overline` / `label` | 12–13/16, 800 caps / 700 | Tile overlines, field labels, the Meal Slot label row |
| `chip` | 12, 700 | Chips only |

**Hierarchy in Plan:** Day (`title-3`) → Meal Slot label row (`label`, muted, with its icon and time) → Course label (`meta`, a fixed 3.5 rem column) → Recipe (`body-strong`).

## 2. Colour roles

Colour means something, and an accent-derived colour never imitates a status colour. With a red or orange accent (Tomato, Saffron), an accent-soft fill reads as "spoiling" or "danger". So accent containers are kept for the roles below and are never used for chips.

| Role | Tokens | Goes on |
|---|---|---|
| Accent, solid | `--color-accent` / `--color-on-accent` | **The one primary action** of a region (Scan, Cooked, Confirm), the current nav item, the today ring. Nothing else. |
| Accent container | `--color-soft`, `--color-soft-strong` / `--color-accent-text` | Selected filters, picture monograms, the "Lines to get" metric, the hero **in dark mode** |
| Neutral container | `--color-surface-2` / `--color-text` | Secondary buttons, **why chips** (accent-coloured icon on a neutral fill), the date badge, Slot Rule chips |
| Success | `--status-success-*` | A ticked Line (filled tick, struck-through name), Cooked, the Zero-waste streak, the Shop progress fill |
| Leftover | `--status-leftover-*` | **Filled** for "Leftover from …", **outlined** for "Leftover for …". A Leftover is always teal. |
| Spoil / danger | `--status-spoil-*`, `--status-danger-*` | Use soon, went off, Throw out |
| Info | `--color-info-*` | Open questions: the To confirm badge, the "not marked Cooked yet" notice, and its row hints |
| Pinned | `--status-pinned-*` | Pinned |
| Tag colours | `--tag-*` | Tag pills only (brief) |

**The hero.**
- In light mode it is accent solid with on-accent text. The why chips on it are `on-accent` at 18 % over the accent.
- In dark mode it is the **accent container** (`--color-soft-strong`) with `--color-text`, and its Cook button becomes accent solid. A full-width tile of the pastel dark accent glares at night.

**Contrast.** Every pair above is checked at WCAG AA for each palette in `theme/palette.golden.ts`, light and dark.

## 3. List rows (`ListRow`)

Every list uses one anatomy: Shop Lines, Pantry Stock Lots, Plan Courses, To confirm, Leftovers and Settings.

```
[control 44] [picture 40] [ title  body-strong, ≤ 2 lines, wraps at a word ] [ value  ≥ --row-value-min, end, tabular ]
                          [ meta   meta, 1 line, ellipsis, tone-able      ] [ sub-value  meta                    ]
```

- **Height.** A row is at least **64 px** high (`--row-min`); a row with a picture is at least 72 px. No row has a fixed height: a two-line title makes the row grow.
- **Vertical alignment.** Content is centred within the row's own height, never within a neighbour's stretched height. Rows in a grid start at the top.
- **The title** wraps **at word boundaries**, at most **2 lines**, then ends in an ellipsis. It never uses `overflow-wrap: anywhere/break-word`, `word-break` or `hyphens: auto`. The full text stays in the accessible name.
- **The meta line** is **one line** with an ellipsis. That is where a hint goes, coloured by its tone (`metaStatus`) and led by a 14 px icon, e.g. "ⓘ Includes Thu Dinner". A row never grows a third line.
- **A sentence that applies to many rows** is said **once**, in a notice above the list, with one action ("Review"). It is never repeated on each row.
- **The value column** (`value`, `subValue`) has a minimum width, `--row-value-min`: 5.5 rem, or 4.25 rem below 600 px. It is end-aligned, tabular and never wraps, so quantities line up down a list.
- **The whole row is the tap target.** It opens the row's sheet ("Not needed", "Mark it", Price). Only the leading control (a tick) and at most one trailing IconButton catch the pointer on their own, so lists need no ⋮ column.

## 4. Grid: by minimum tile width

`BentoGrid` takes `min`, never a column count:

```css
grid-template-columns: repeat(auto-fill, minmax(min(var(--tile-min-*), 100%), 1fr));
```

| `min` | Token | Width | For | Columns at 390 / 834 / 1024 (rail) |
|---|---|---|---|---|
| `metric` | `--tile-min-metric` | 9.5 rem | Metric tiles (a number and a label) | 3 / 3+ / 3+ |
| `card` | `--tile-min-card` | 20 rem | List cards, recipe cards, the Shop card grid | 1 / 2 / 2 |
| `day` | `--tile-min-day` | 21 rem | Plan day tiles | 1 / 2 / 2 |
| `wide` | `--tile-min-wide` | 28 rem | Two-up feature tiles | 1 / 1 / 2 |

- **Width never comes from status.** No tile spans extra columns because it is "today" or "important". Today in Plan is marked by its accent ring and an accent name. The hero, when it spans, spans the **full row** (`span="full"`).
- **Small tiles come only as a metric strip** (`min="metric"`, `auto-fit`) that fills its row. On a phone the strip is always one row of up to three. A half-width orphan cannot happen.
- **Gaps.** `--bento-gap` between tiles. A tile's content is top-aligned.

**Decisions taken (2026-11-12):**
- Shop is a dense single list on a phone and a 2-column card grid from 768 px (`min="card"`). It is the same `ListRow` in both.
- Plan is a week grid by `min="day"` (2 columns on a tablet, 1 on a phone), with today not spanning.

## 5. ActionGroup

```
<ActionGroup label="Thu Dinner" primary={{label:'Cooked', onClick}} secondary={{label:'Adjust', onClick}} more={[{id:'not-cooked', label:'Not cooked', onSelect}]} />
```

1. **At most one primary** (filled accent) and **one secondary** per group. Everything else goes into a **⋮ Menu** named "More for <label>": Not cooked, Not needed, Delete, and any other rare or destructive action.
2. **Wide container** (the host is at least 35 rem wide; a container query on `.action-group-host`):
   - the group sits at the end of its row;
   - buttons keep their natural width;
   - each group has a fixed inline size, `--action-group-inline-size`, so every row's actions line up in one column.
3. **Narrow container:** the group takes its own line as a grid of equal tracks (`1fr 1fr 44px`). It **never** `flex-wrap`s raggedly.
4. **Icon actions on a row** (Cook, Swap, Pin, ⋮) form one icon set, always at the row's end, in that fixed order. They are never on a line of their own.

## 6. Chips

- **One line, always.**
  - 26 px high;
  - `white-space: nowrap`;
  - the label ends in an ellipsis;
  - the full text is in the accessible name and in `title` (the tooltip). A why chip's press opens its sheet.
- **A row of chips never wraps.** It shows what fits; the sheet shows all.
- **One kind, one look:**

| Kind | Look |
|---|---|
| why | neutral container (`surface-2`, `text`) with an accent-coloured icon |
| Leftover from | filled leftover tone |
| Leftover for | outlined leftover tone (`kind="status" status="leftover" outline`) |
| Slot Rule | neutral with the calendar icon |
| Pinned | pinned tone |
| Tag | Tag colours |

## 7. Pictures

- **Never an empty box.** An Ingredient or Product without a Picture, or whose Picture fails to load, shows a **monogram**:
  - its first letter, uppercase, weight 800;
  - `--color-accent-text` on `--color-soft`;
  - the same size and radius as a picture, so rows stay aligned.
- `Thumb` takes the `name` it stands for.
- Recipes keep the brief's "Tag icon + initial" tile (`RecipeThumb`).

## 8. Spacing and the nav

- **Between page sections:** `--section-gap` (`--space-6`).
- **Between tiles:** `--bento-gap`.
- **Inside a tile:** padding is `--tile-pad`, never overridden. Header to content is `--space-3`. Rows are separated by a 1 px `--color-line` divider, with no ad-hoc margins. Raw `px` / `rem` gaps are not allowed in feature CSS.
- **Nav clearance.**
  - Below 1024 px the page ends at least `--space-6` above the floating bottom bar: `--nav-clearance` = nav height + inset + `--space-6` + the safe area.
  - At the end of a scroll, no content box of `<main>` may be under the bar. The page-layout guard checks this as rule **P12**.

## 9. The To confirm pattern

**One row per Meal Slot on a date, never one per Course.**

```
[when: WED / Dinner, 4.5 rem badge] [what: Main Recipe (body-strong), "+ Side · Two-colour cauliflower…" (meta, 1 line)] [ActionGroup]
```

- **The action group:**
  - primary **Cooked**, or **All Cooked** when the slot has several Courses to confirm;
  - secondary **Adjust**, which opens the existing Mark as Cooked sheet, where each Course can be set on its own and portions changed;
  - **Not cooked** in ⋮.
- **The tile** is surface. Its title row has the info-tone icon badge, "To confirm" (`title-3`) and a count.
- **Alignment.** The groups of all rows share one column (§5).

Decided 2026-11-12: option A, one decision per Meal Slot. The per-Course checklist (option B) was not chosen.

## 10. Enforcement

| Guard | Where it lives | What it checks |
|---|---|---|
| `type-scale` | `scripts/check-ui.sh` | A `font-size` / `font` other than a `--text-*` token, or `inherit`. |
| `opacity-muting` | `scripts/check-ui.sh` | `opacity` between 0.5 and 0.95 outside a disabled state (use `--color-muted`). |
| `word-break` | `scripts/check-ui.sh` | `hyphens: auto`, `overflow-wrap: anywhere / break-word`, `word-break: break-all / break-word` on anything but a one-token value (email, URL, link, barcode, code). |
| `check-ui.rules` | `scripts/check-ui.rules` | All three rules **fail** in `web/src/ui` and in the screens redone in beta.5.1 (`shop`, `today`, `plan`). They warn elsewhere, until each screen's wave adds its folder. |
| Page-layout guard | `scripts/check-page-layout.sh` | The quick profile includes the iPad portrait sizes 834×1194 and 1024×1366. The seed uses long, realistic names and a "not marked Cooked yet" hint. **P11** (mid-word break, clipped text) and **P12** (content under the bottom bar) run at every size. |
| Primitive contracts | `web/src/ui/*.ds.test.tsx` | The primitive contracts above. |
