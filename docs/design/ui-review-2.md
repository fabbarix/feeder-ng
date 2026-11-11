# Feeder UI review 2: post-redesign punch list (Bento)

Status: spec, 2026-11-10. Author: design review (opus). Scope: the whole web SPA on `main` @ `09a891e`, with a focus on what nobody
had looked at yet: **screens wider than 1280 px, the iPad sizes, and the redesign as a design (not as a function)**.
Revised after review on `main` @ `8c1c72e` (U1 TimeField, R11c zero-waste streak and D2 release tags merged): adds the New Ingredient
sheet (F-09), records the user's decisions (section 3.7) and updates K1/K3/L-11.
Inputs: [ux-brief.md](ux-brief.md) (direction **Bento**), [ui-fix-plan.md](ui-fix-plan.md) (the pre-redesign review this one checks against),
[GLOSSARY.md](../../GLOSSARY.md), [CLAUDE.md](../../CLAUDE.md), [architecture.md](../dev/architecture.md), the QA round-2 report.

## How this was reviewed

- `make build` of `main` in the `design/ui-review-2` worktree; the binary ran detached on this worktree's own port (`127.0.0.1:18477`) with `FEEDER_DEV_LOGIN=1`,
  `admin@example.test` and a scratch `FEEDER_DATA_DIR` in `build/`. Seeded through the API (the QA round-2 seeder): 4 Members including
  "Lucia Maria Bernadette", 12 Meal Slots with attendance, 25 Ingredients, 10 Recipes (8 with photos, one very long name, one Ready Meal,
  Advance/Passive Steps, a Step photo), 3 Shops with a weight barcode rule, 8 Products with Prices (one archived), 11 Stock Lots including
  3 spoiled, a 7-day plan, a Shopping List with extras, 2 allowlisted Users and a running timer.
- Every route was captured with Playwright Chromium (from the existing npx cache, nothing downloaded) at **390×844, 820×1180, 1180×820,
  1280×800, 1440×900, 1920×1080 and 2560×1440**, light and dark (448 captures; iPad UA + touch at 820/1180, mobile emulation at 390), plus
  1024 and 1100 for the rail. Each capture also recorded layout metrics in the page (content box, centring offset against the area right of
  the rail, every field's width and inputmode, sticky/fixed elements, elements past the viewport, grid column counts).
- **WebKit** (Playwright `webkit-2336`, already installed) re-ran the form-heavy screens at 820 and 1180 with the iPad UA: Recipe editor,
  Household, Members, Meal Slots, Planning rules, Your preferences, Shop detail, Ingredient, Product, Import, Today, Plan, Cook Mode. WebKit
  shows the same layout as Chromium; the TimeField clipping (K1) reproduces in WebKit too.
- 22 sheets and dialogs were opened at 390/820/1920 (Planned Meal, Swap, Add Member, Edit/Add Meal Slot, Add a Stock Lot, More menus,
  Shop range select, Add to Shopping List, Meal Slot select, Add rule, New Ingredient, Regenerate confirm, avatar menu, Import Review,
  sign-in signed out). Chrome DevTools-style probes (computed colours) were used for the contrast numbers.
- A draft layout guard ([ui-review-2/check-page-layout.draft.mjs](ui-review-2/check-page-layout.draft.mjs), section 6) was run against
  the same server: **228 failures** today (P2 centring 12, P3 max width 64, P4 short fields 125, P5 collapsed field 6, P6 sticky bars 18,
  P7 rail contrast 3).
- Screenshots (WebP, 0.7 MB in total) are in [ui-review-2/](ui-review-2/); ids below refer to them. Screen 41 is the user's own
  capture of the New Ingredient sheet (F-09).

**A note on "2000 px".** The user's New Recipe screenshot (`4b6bc764-image.png`) is 2420 physical px wide but shows the compact 88 px rail,
which only renders below 1440 CSS px: it is a ~1210 CSS px viewport on a 2× display. So the "empty right side" is not a 4K-only problem:
it shows on **every viewport from 1024 CSS px up**, i.e. every laptop and an iPad in landscape. Measured: the editor column is 760 px,
left-aligned inside a 1100 px `main`, 138–142 px off-centre at 1180–2560 (screenshots 01, 02, 38).

---

## 1. Summary

The redesign fixed what the first review was about: tokens, contrast, icons, primitives, native controls, the rail, the chromeless board and
Cook Mode, Plan 2/4/7 columns. What it did not get is a **page layout system**. There is exactly one width rule in the shell
(`.app-main { max-width: 1100px; margin: 0 auto }` in `app/shell.css`), plus two ad-hoc overrides (`recipes.css`: 760 px on detail and
editor, not centred; `notifications.css`: 640 px, centred). Nothing sizes a field to its value: every `ui-field` is the width of its
container. The result, from biggest to smallest:

1. **Wide screens get a phone layout in a 1036 px island.** At 1920 the content is 1036 px in a 1680 px area; at 2560, 1036 in 2320
   (40 %). Forms, lists and the Plan are all the same width whatever they hold (05, 07, 08, 30, 32, 37).
2. **Forms are walls of full-width fields.** 125 short-value fields are wider than 240 px at ≥ 820: Yield, Cool-down, Leftover Use-by,
   Planning Horizon, Shelf Life, Pack size, Amount, Duration, Lead time, digit positions, "At most per week". A `− 7 +` stepper spans 862 px
   with the minus and plus 800 px apart (09). The Recipe editor is **7,300 px tall** at 1920 because each Ingredient line is a 250 px card
   (03).
3. **Sticky action bars float.** The editor's Cancel/Save bar and Recipe detail's Cook bar are page-coloured strips inside the 760 px
   column, not attached to any card or edge (01, 04, 17, 20).
4. **Two broken screens and one unreadable control**: the Allowlist (email field collapsed to 83 px, rows clipped on phone; 10, 11),
   the Ingredient Base Unit control (a native `<fieldset>` frame; 13), and the current **Scan** rail item at ≥ 1440 (1.31:1 light,
   ~1.6:1 dark; 16).
5. **Inconsistent action placement**: Save on the left in some sheets and on the right in others, centred tertiary text links for adds
   and saves, full-width primary buttons on desktop (09, 12, 14, 19, 26, 27, 28).

6. **The New Ingredient sheet** (41) shows all of the above in one small sheet: a doubled focus ring, unlabelled Base Unit chips with no
   visible selection, a disabled Create button with no reason, no spacing rhythm.

**Counts (new items):** High 8, Medium 12, Low 12 (32 open; 33 raised, of which L-11 is decided with no action). Plus 5
already-reported items consolidated in section 2.

**Top 10, in fix order:** L-01 page widths, L-03 sticky action bar, F-01 field sizes, E-01 Recipe editor, L-04 Scan rail contrast,
F-02 Allowlist, **F-09 New Ingredient sheet** (focus ring in R2-F, sheet in R14), L-02 detail/editor centring, F-04 form actions, L-06 list
widths. (L-05 Plan at wide sizes moves to 11th.)

---

## 2. Already reported by the user (consolidated)

| Id | Item | Owner | Status / what this review adds |
|---|---|---|---|
| K1 | TimeField clipped ("22 : 0C") on iPad | **U1** (`ui/fields/TimeField.css`, `Field.css`) | **Merged to main at `8c1c72e`.** Was reproduced in Chromium and WebKit at every width on Household quiet hours and the Meal Slot sheet (09, 34, 35). Re-checked against main's CSS (no browser): segments are `3ch` with `padding: 0`, `appearance: none` (no WebKit chrome), tabular numerals; the focus ring is a rounded rect (`--radius-control`, `outline-offset: 0`), not a circle over the digits; `.time-field` is `flex`, full width, with the new shared `--field-pad-inline` that TextField, Select and DateField also use; `field-css.test.ts` pins it. **Left:** (a) not yet seen in a real engine after the merge: confirm at 820/1180 in WebKit with the layout guard run of R2-F; (b) the TimeField has no control-level focus (`.time-field` has no `:focus-within`), so it shows a third focus style (accent outline on the segment) next to the doubled ring of other fields: fold into F-09's single focus ring (R2-F); (c) it now stretches to the container, so "19:30" sits in a 500+ px box: give it `size="sm"` in F-01 (R2-F); (d) disabled TimeField still uses `opacity: .38` while the other fields use muted colours (WP3b): align in R2-F. None of these is High any more. |
| K2 | Breadcrumbs replace "Back to Settings" | **R11a** (`ui/Breadcrumbs`, `PageHeader`) | In progress on `team/r11a-settings-shell`. Also needed on Recipe detail/edit, Import, the /recipes/export screen, Ingredient, Product, Shop detail (R11a's note covers "everywhere there is hierarchy"; Ingredient detail has no back control at all today, 13). **Side rail at 1024–1280: not clipped** (88 px rail, labels fit at 1024, 1100, 1180, 1280; the 240 px rail fits from 1440). Medium. |
| K3 | Member sheet: Custom swatch overflow, unlabelled stepper, Avatar without hint | **R11a** | Confirmed (26): the stepper "− 1 +" has no label; Save Member is left-aligned while Add a Stock Lot's Save is right-aligned (see F-04). **Decided (user):** a Member's avatar is a photo, an emoji or initials. Emoji and initials now (R11a: a choice "Initials · Emoji", with Photo added as a third option only once it works; initials default from the name, the colour swatch stays as the background); photo later through the shared `ImagePicker` primitive (the same one F-09 uses for an Ingredient photo), not a Member-only upload. Medium. |
| K4 | "Couldn't plan" as one pink danger tile with nine identical lines | **future Couldn't-plan team** (Today, Plan, board) | Not reproduced here (the seed plans every Meal Slot). User's direction stands: group by cause, warn/info tone, one fix action per cause, a first-run setup checklist, attendance defaulting to everyone. Fold L-05 and L-07 into that team. High. |
| K5 | Rail lists Scan above Today | **R11a** (fixed on its branch) | Still on main (`RAIL_NAV` in `app/nav.ts`). Add L-04 to the same change. Medium. |

---

## 3. Punch list

Severity: **High** = broken, unreadable or the first thing a user sees on that screen size; **Medium** = clearly wrong layout or
inconsistency; **Low** = polish. "Screens" lists the screenshots.

### 3.1 Layout and shell (L)

**L-01 High: no page-width system; every page is a 1036 px island.** Screens 05, 07, 08, 30, 31, 32, 37, 02.
`app/shell.css` caps `main` at 1100 px for every route. A Shop picker with four rows, the Plan week, a Recipe grid and the Household form
all get the same width; at 1920 there is 322 px of empty ground on each side, at 2560 642 px.
**Fix (token + shell + primitive):**
- Tokens in `styles.css`: `--page-narrow: 720px` (forms, settings, single-column lists, Import), `--page-default: 1120px` (Today, Stock,
  Recipe detail), `--page-wide: 1480px` (Plan, Recipes grid, Shop list), `--page-gutter` 16/24/32.
- A `ui/Page` primitive: `<Page width="narrow|default|wide" header={<PageHeader …/>}>` renders
  `<div class="page" data-page-width>` with `max-inline-size: var(--page-*)`, `margin-inline: auto`, `padding-inline: var(--page-gutter)`.
  `app-main` drops its own `max-width` and becomes full width of the grid column, so centring is always relative to the area right of
  the rail. Every screen picks a width once; nothing else sets `max-width` (guard P3 enforces it).
- Per route: narrow: Scan picker, Import, the /recipes/export screen, Ingredients, Ingredient, Products, Product, Settings and every
  sub-page, sign-in already 400. Default: Today, Stock, Recipe detail, Recipe editor (see E-01). Wide: Plan, Recipes, Shop.
  Chromeless Cook Mode keeps its 1100 px (C-01 aside).

**L-02 High: Recipe detail and editor are 760 px wide and left-aligned.** Screens 01, 02, 18, 38. `recipes.css` sets
`max-inline-size: 760px` on `.recipe-detail, .recipe-editor` without `margin-inline: auto` (off-centre by 138–142 px at ≥ 1180).
**Fix:** remove the ad-hoc rule; use `<Page width="default">` and the layouts in E-01 / D-01. This is the user's main report.

**L-03 High: sticky action bars are detached from everything.** Screens 01, 04, 17, 20.
`.recipe-editor__footer` and `.cook-entry` are `position: sticky` strips with `background: var(--color-bg)` inside the 760 px column: they
start at the column's left, the buttons hug its right edge, and they belong to no card. At 820 the editor's content shows between the
footer and the bottom bar (04); at 390 the Cook bar cuts the Ingredient list mid-line with no edge (17); the Import Review footer is a card
floating over the review tiles (20).
**Fix:** a shared `ui/StickyActionBar` (one primitive for editor, Cook entry, Import Review, any long form): full width of the `Page`
container (not of a card), `background: var(--color-surface)`, top hairline `--color-line` plus `--elev-2` only while content scrolls under
it, inner row aligned to the form column, actions right-aligned (tertiary Cancel, then primary), `bottom: var(--nav-clearance)` on phone,
`bottom: 0` from 1024. Phone: primary full width, Cancel as an IconButton or tertiary to its left. On ≥ 1280 the editor may also show
Save in the `PageHeader` actions (then the bar can hide when the header is visible).

**L-04 High: the current Scan rail item is unreadable from 1440.** Screen 16. In the expanded rail
`.side-rail__link[aria-current='page'] { background: var(--color-soft) }` overrides the accent fill of `[data-accent='true']`, but the text
stays `--color-on-accent`: white on `#bfebcd` = **1.31:1** (light), `#051b0e` on `#143c25` ≈ 1.6:1 (dark). Below 1440 it is fine.
**Fix (shell.css, 3 lines):** add `.side-rail__link[data-accent='true'][aria-current='page'] { background: var(--color-accent);
color: var(--color-on-accent); box-shadow: 0 0 0 3px var(--color-soft) }` inside the 1440 media block, after the current rule
(same ring as the bottom bar). Owner R11a (already editing the rail order, K5).

**L-05 Medium: the Plan week is cramped at 1440–2560.** Screens 06, 07. Seven 140 px day tiles in the 1036 px column: Recipe names
truncate ("Chicken tikka…"), the Leftover chip wraps to 3 lines, while 400+ px is empty on each side.
**Fix:** Plan uses `--page-wide` (day tiles ≈ 200 px at 1480); keep 4 columns from 820 to 1279 and 7 from 1280 only when the container
is ≥ 1200 (`@container` query on the grid, not a viewport query). Owner: future Couldn't-plan team (plan files).

**L-06 Medium: single-column lists span 1036 px.** Screens 08, 21, 30, 37, 40. Stock, Ingredients, Products, Settings, the
/recipes/export screen, the Scan Shop picker, Members and Meal Slots put the name at the left and the value/chevron/checkbox ~1,000 px away;
the eye cannot track a row. Only Notifications is narrow (640, centred), so Settings pages also jump in width (29 vs 37).
**Fix:** `<Page width="narrow">` for all of them. Stock (default width) at ≥ 1280: two columns, "Throw out or keep?" tile plus search and
filter chips in a 360 px sticky aside, the Stock list beside it.

**L-07 Medium: Today on desktop is a stretched phone.** Screens 05, 36. The hero's "Cook · 45 min" button is ~1000 px wide; "Throw out
or keep?" stacks each Stock Lot with its two buttons underneath, filling the full width with three short rows.
**Fix:** from 820 the hero's primary is an auto-width `lg` button at the tile's bottom-right; "Throw out or keep?" rows become `ListRow`s
with the two actions trailing; at ≥ 1280 a 3-column Bento (hero spans 2 columns × 2 rows, Use soon and streak stacked beside it).
Owners: **R12** (Reheat on the Today hero, `TonightHero.tsx`) merges first, then the future Couldn't-plan team (Today grid).

**L-08 Medium: Cook Mode on phone leaves the lower half empty.** Screen 22. The step tile is content-height, so Back/Next sit mid-screen
and move with each Step; the mockup and fix plan 2.7 have the step tile filling the height with Back/Next pinned at the bottom
(tap zones). At 820 and above this is already right. **Fix:** `cook.css`: the Cook page is a `100dvh` grid (`auto 1fr auto auto`), Back/Next
row `position: sticky; bottom: env(safe-area-inset-bottom)`. Owner: after **R12** (Cook files).

**L-09 Low: grids do not use the space.** Screens 31, 32. Recipes stays at 4 columns from 1024 (tiles 240 px at 2560); the Shopping
List is 2 columns of 500 px tiles holding "eggs / 2 pieces". **Fix:** in a wide page use
`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` for Recipes and `minmax(240px, 1fr)` for Shopping List tiles.

**L-10 Low: the kitchen board on a phone.** Screen 24. `/board` is reachable from the avatar menu at 390 and keeps 4 columns: "Chick",
"15:2", "Tues" clipped. **Fix:** 2 columns below 600 px (hero full width), or hide the menu item below 768.

**L-11 Decided, no action (not counted): the board ignores the dark scheme by day.** Screen 39 (dark scheme, 15:28): light tiles.
**Decided (user):** the kitchen board follows sunset only ("dims to dark after sunset"), never a User's Dark choice: it is a shared
Household screen, not one User's. Current behaviour is correct; removed from R2-4.

**L-12 Low: top bar and content drift apart at ≥ 1920.** Screens 05, 32. The avatar sits at the viewport's right edge, 300–640 px from
the page's right edge, and the brand word sits above the rail. Acceptable app-shell convention; if it bothers, put the brand in the rail's
first row and keep page-level actions in `PageHeader` (they already are).

### 3.2 Fields and forms (F)

**F-01 High: fields are as wide as their container, whatever their value.** Screens 01, 03, 09, 14, 15, 28, 38. The user's examples
(Yield, Tag) generalise: 125 guard hits. `ui/fields` has no size concept.
**Fix (primitive level, `ui/fields`):**
- `FieldFrame` gets `size?: 'xs' | 'sm' | 'md' | 'lg' | 'full'` → `.ui-field[data-size]` with `max-inline-size`: xs 112 px (1–2 digits),
  sm 168 px (up to 4 digits plus a unit suffix), md 320 px (a name, a time zone, an email), lg 480 px, full 100 %. Default `full` for
  TextArea, `md` for TextField/Select, `sm` for NumberField.
- `NumberField` with a stepper renders as a compact group `[−] 7 [+]` (40 px buttons, tabular value, unit suffix inside) of 136 px for
  `xs`, never stretched. The current full-width stepper control (09) goes away.
- A `ui/FieldRow` layout primitive: `display: flex; flex-wrap: wrap; gap: var(--space-3)` so short fields sit side by side
  (Yield · Cool-down · Leftover Use-by; Quantity · Unit; digit start · length) and wrap on phone.
- Tag entry is a chip input (chips and the text field on one line, `md`), not a full-width field under the chips.
- Guard P4 enforces it: a numeric/decimal/spinbutton field wider than 240 px needs an explicit `size="full"`.
Owner: new **UI foundations** team after U1 merges (U1 edits `Field.css`, `TimeField.css`, `Select.css`, `DateField.css`).
Adoption per screen in the screen WPs (section 5).

**F-02 High: the Allowlist page is broken.** Screens 10, 11. The "Email to allow" input collapses to 83 px (the field sits in a flex row
with "Add to allowlist" and shrinks); on phone each row overflows the card ("Rem…" clipped, the email itself is missing; only "(you)"
over a checkbox); each checkbox is labelled "Admin: admin@example.test", repeating the email.
**Fix:** field `md` + `size` on a `FieldRow` with the button; rows as `ListRow` (title = email, meta = "You · Last Admin", trailing a
`Switch` labelled "Admin" with `aria-label="Admin: {email}"` and a danger-tertiary Remove in an overflow on phone). Owner: **A1** (Access
Requests sit next to the Allowlist; PM to confirm, else R11a).

**F-03 Medium: full-width primary and secondary buttons on desktop.** Screens 09, 12, 19, 28. "Save household settings", "Add Slot Rule",
"Save Variety Rule", "Copy Agent Prompt", "Review", "Save preferences", "Cook · 45 min" stretch to 1000 px.
**Fix:** `Button` `block?: 'phone' | 'always' | 'never'` (default `phone`: full width below 600 px only); form submit buttons live in
`FormActions` (F-04).

**F-04 Medium: action placement is inconsistent.** Screens 14, 15, 26, 27, 35. Save left-aligned (Add Member, Edit Meal Slot, Add rule)
vs right-aligned (Add a Stock Lot, Regenerate confirm, editor); centred tertiary text for adds and saves ("Add Member", "Add barcode",
"Save pack size", "Add rule", "New Product", "Remove photo", "Add ingredient use", "Add Shop Barcode"); "Rename" and "Delete Shop" as
loose text under the h1; Save Shelf Life / Clear Shelf Life as two text links.
**Fix:** `ui/FormActions` (and `BottomSheet`/`Dialog` footers using it): right-aligned from 600 px, primary last, tertiary Cancel
before it, destructive actions at the far left (`danger-tertiary`); on phone the primary is full width with the rest stacked under it.
List "add" actions are secondary buttons with a `plus` icon, left-aligned under the list. Entity actions (Rename, Delete, Archive) go to
the `PageHeader` overflow `IconButton`.

**F-05 Medium: Ingredient Base Unit renders a native fieldset frame.** Screen 13. `IngredientScreen.tsx` wraps the Segmented in
`<fieldset disabled><legend>`: a square 1 px browser border with the legend cut into it, plus a separate filled "g" bar above it that
repeats the value, and "3 days" printed above the Shelf Life field that already shows 3. **Fix:** a `Segmented` with its own label
(fieldset reset in `ui`: `border:0; padding:0; margin:0; min-inline-size:0`, legend as `ui-field__label`); when locked, show a read-only
value row "Base Unit · g" with the helper "Used in 3 places, so it can't change"; drop the duplicate "g" and "3 days". Shelf Life:
NumberField `xs` with a "days" suffix and one Save in `FormActions`.

**F-06 Medium: Planner Style has two controls for one value.** Screens 09, 34. A Slider (Use what we have · Variety · Favourites) and,
below it, three filter chips with the same three values. **Fix:** keep the 3-stop Slider (fix plan 4.10) and delete the chip row
(or the reverse; one control only). Settings files.

**F-07 Medium: Your preferences shows an unlabelled accent bar.** Screen 12. A 48 px accent-filled bar with no text sits between the
swatches and a disabled full-width "Save preferences". It reads as a broken button. **Fix:** if it is the live preview, make it a
labelled preview tile ("Preview" overline, a sample chip, a primary and a soft button) or remove it; Save in `FormActions`, auto width.

**F-08 Medium: the Add rule dialog is 10 full-width fields.** Screen 15. 918 px tall; "Item code starts at digit", "Item code length",
"Value starts at digit", "Value length", "Decimal places" are 1–2 digit numbers in 512 px fields; the error "prefix must be one or more
digits" shows before anything was typed. **Fix:** two `FieldRow`s of `xs` NumberFields under "Item code" and "Value" subheads, a
13-cell barcode diagram that highlights the ranges live (the sample barcode preview already exists), validation on blur/submit only.

**F-09 High: the New Ingredient sheet.** Screen 41 (the user's capture; `features/ingredients/components/NewIngredientSheet.tsx`). It is
the sheet a User meets when an Ingredient is missing, including from a Recipe line, so it is a first impression. What is wrong:
1. **Double focus ring** on the Name field: a pale green halo outside a dark green border. This is the field primitive, so it shows on
   every TextField, NumberField and SearchField: `ui/fields/Field.css` `.ui-field__control:focus-within` sets `border-color:
   var(--color-accent)` **and** `outline: 3px solid var(--color-soft-strong); outline-offset: 1px` (SearchField repeats the halo);
   the inner `.ui-field__input` has `outline: none`, so the inner input is not the culprit. U1 (merged, `8c1c72e`) did not touch this
   rule: it added `--field-pad-inline`, reset the input's padding and appearance, and gave the TimeField *segment* its own rounded ring
   (accent outline, `outline-offset: 0`), which is a third focus style.
2. **Base Unit has no label**: three `filter` Chips "g · ml · piece" with no "Base Unit" label on screen (only an `aria-label`), no
   helper explaining what it decides, none preselected and no visible selected state in the capture; they sit flush under the input.
3. **Create Ingredient is jammed** under the chips with no gap, left-aligned and full colour-block, unlike other sheets' action rows.
4. **The disabled Create Ingredient** is pale green on near-white text (low contrast) and gives no reason why it is disabled.
5. **No vertical rhythm**: label, field, chips and button touch; the sheet then ends in a large empty area.
6. **Only one field**: Shelf Life and a picture, which the User expects to set here, are missing (Shelf Life is only on the Ingredient
   page afterwards).

**Fix:**
- **One focus ring, in the primitive (R2-F):** a token `--focus-ring` in `styles.css` (one 2 px accent ring, e.g. `box-shadow: 0 0 0 2px
  var(--color-accent)` on the control with `border-color: var(--color-accent)`, or an outline; not both a border change and a halo) used by
  `.ui-field__control:focus-within`, `.search-field__control:focus-within`, `.select__trigger`, `.date-field__trigger` and a new
  `.time-field:focus-within` (the segment then shows only a soft fill, no outline of its own). Contrast of the ring ≥ 3:1 against the
  sheet surface in both schemes. `field-css.test.ts` gets one assertion per control: the same token, no second outline.
- **Labelled sections with spacing tokens:** the form is a `ui-stack` with `gap: var(--space-5)` between fields, `--space-1` label to
  control, `--space-2` control to helper; no bare `<div>`s with zero gap.
- **Base Unit as a `Segmented`** with its own visible label "Base Unit", an icon per option (Phosphor `Scales` g, `Drop` ml, `Cube`
  piece; register them in `Icon` if missing) and the text, a clear selected state (filled `--color-accent` segment with
  `--color-on-accent` text and a check, not only a shade change), and a helper: "How Stock and Shopping Lists count it. It can't change
  once the Ingredient is used." This reuses the F-05 Segmented + fieldset reset.
- **A sensible default:** preselect `g`; when the sheet is opened from a Recipe line or a Scan that already has a unit (ml, piece),
  preselect the matching Base Unit. With a default there is never a "no Base Unit" state.
- **Shelf Life:** an optional NumberField `xs` with a "days" suffix and the helper "Leave blank if it keeps." (GLOSSARY: Shelf Life is
  optional).
- **Picture:** an optional Ingredient photo through the shared `ImagePicker` (also used for the Member avatar photo, K3). The Ingredient
  has no image field today (`features/ingredients/types.ts`), so this needs a backend field and a short spec; ship the sheet without it
  first and add it when the field exists.
- **Action bar aligned with the other sheets:** the sheet footer uses `FormActions` (F-04): tertiary Cancel, primary "Create Ingredient"
  right-aligned from 600 px, full width on phone, separated from the form by `--space-6` and a hairline when the sheet scrolls.
- **Inline validation, not a disabled button:** Create Ingredient stays enabled; on submit with an empty Name the field shows the error
  "Give the Ingredient a name" under it and takes focus; a taken name shows the existing `nameTaken` message as the field's error, not a
  loose `<p role="alert">` above the button. If a disabled state is ever kept (while saving), it uses the WP3b muted disabled contrast
  and a spinner label "Creating…".
- **Height:** the sheet is content-height; on ≥ 768 the dialog has no empty block under the actions.
Owners: the **inline-Ingredient-creation team (R14)** for the sheet (`NewIngredientSheet.tsx`, its test, `ingredients/strings.ts`, the
`.new-ingredient__*` rules in `ingredients.css`); **R2-F** for the focus ring and the `Segmented` label/fieldset reset in `ui/fields`. R14
uses `FormActions` and the single focus ring once R2-F merges; until then it builds the layout and validation against the current
primitives. `ingredients.css` is also touched by R2-3 (F-05): the PM serialises those two.

### 3.3 Recipe editor (E) and Recipe detail (D)

**E-01 High: the Recipe editor layout and density.** Screens 01, 02, 03, 04, 38. 760 px left-aligned column (L-02); 7,300 px tall at 1920;
each Ingredient line is a 4-row card (Ingredient select; Quantity + Unit; "optional" + Note; a trash icon on its own row) of ~250 px.
**Recommendation: one centred column with section cards (not a two-column editor).** Editing a Recipe is a linear task, and the problem is
height and field sizing, not width; a second column would split attention, complicate the sticky bar and diverge from the phone layout.
- `<Page width="default">` with the editor column `max-inline-size: 840px; margin-inline: auto`; sections as cards (Details, Photo,
  Ingredients, Steps, Planning); at ≥ 1280 a sticky section index (Details · Photo · Ingredients · Steps) in the left gutter, which is
  free space today.
- Details: Name `lg`, Description full; a `FieldRow` of Yield `xs` stepper · Cool-down `xs` (helper "blank = household default") ·
  Leftover Use-by `xs`; Ready Meal checkbox; Tags as chip input `md`; Source link `lg`, Attribution `md` in a row.
- `IngredientLineRow` as **one row from 720 px**: drag handle 24 · `IngredientSelect` 1fr · Quantity `xs` 88 · Unit `sm` 120 · Note 1fr
  (placeholder "note") · "Optional" as a visible toggle chip (or a checkbox with a visible "Optional" label; never an icon whose meaning
  lives only in a tooltip, which touch screens cannot show) · remove IconButton. Phone: 2 rows (Ingredient full; Quantity · Unit · more).
  Expected height: 56 px per line instead of 250.
- `StickyActionBar` (L-03). Breadcrumbs "Recipes › Chicken tikka traybake › Edit" (R11a).
Owner: **future Recipe-editor-features team** (`RecipeEditorScreen`, `IngredientLineRow`, `IngredientSelect`, `StepsEditor`), after R12
(adds the reheat field to the editor and touches `recipes/lib/draft.ts`, `types.ts`) and after UI foundations.

**E-02 Medium: Step cards are 500 px each.** Screen 03. Step text, a full-width Kind segmented control, a full-width Duration field, an
empty "USES" overline with a centred "+ Add ingredient use", and an always-open FileDrop per Step. **Fix:** Step card = number badge ·
Step text (auto-grow) · one `FieldRow` of Kind `Segmented` + Duration/Lead time `xs` with "min" suffix · "Uses" as chips with a "+ Use"
chip · "Add photo" as an IconButton that expands the FileDrop only when used; "After step" chips stay. Reorder via drag handle plus the
existing arrows in an overflow.

**E-03 Low: editor details.** Screen 03. Step cards are indented 32 px deeper than Ingredient cards (two nesting depths for the same
level); the photo preview is 560×310 with a FileDrop under it and a centred "Remove photo": use a 16:9 240 px thumb with Replace and Remove
buttons beside it.

**D-01 Medium: Recipe detail at ≥ 1280 is one narrow column.** Screen 18. Ingredients (a 2-column quantity/name list) use 30 % of their
tile; Steps start below the fold. **Fix:** default page; from 1280 two columns: left 360 px sticky (photo, metric tiles, Ingredients,
Batches stepper + Start Cook Mode, i.e. the Cook entry moves out of the sticky bar), right Steps and Preferences. Below 1280 keep the single
centred column with the `StickyActionBar` Cook entry (L-03 fixes the phone overlap in 17). Owner: same team as E-01 (same feature).

**D-02 Low: hero photo crop.** Screens 18, 17. At 1180–1920 the hero is 760×100–150, so a 4:3 photo is cut to a ~5:1 strip. Cap the hero
at 16:9 up to 820 and use the left-column photo (D-01) above that.

### 3.4 Sheets, dialogs and menus (G)

**G-01 Low: overflow menus open as sheets on desktop.** Screen 25. "More" on Recipe detail (Archive, Delete) and on Recipes (Import,
Copy Agent Prompt, Show archived) open a 560 px centred dialog with a title and a grab handle for two or three actions. **Fix:** a
`ui/Menu` popover anchored to the IconButton from 768 px (the avatar menu already does this, 33); sheet only on phone.

**G-02 Low: sheets keep the grab handle when shown as a dialog.** Screens 25, 26, 27. From 768 px BottomSheet renders as a centred
dialog (good: 560 px, centred, guard P8 passes) but still draws the 36×4 handle, which promises a drag that does not exist. Hide it
from 768 in `BottomSheet.css`.

### 3.5 Screen details (S)

**S-01 Low: the avatar menu mixes icons and chevrons.** Screen 33. Stock, Kitchen board, Settings and Sign out have their icons;
Ingredients, Products and Shops show the default `chevron` (`MENU_NAV` falls back when `icon` is missing). Give them `ingredients`,
`products` (Barcode) and `storefront`. Owner: after A1 (edits `YourMenu.tsx`, `accessMenu.ts`).

**S-02 Low: Ingredient names are lowercase in some places.** Screens 31, 18. Shopping List tiles ("aubergine", "basmati rice"),
Recipe detail Ingredients, Import Review, Product meta ("spaghetti · 500 g"). Stock, Ingredients and Plan already use `displayName`.
Use it in Shop, Recipes, Import and Products (data stays as stored). Split by owner: recipes part in R2-1, Products part in R2-3,
Shop and Import parts in R2-4.

**S-03 Low: rule and conversion forms are always open.** Screens 28, 13. Planning rules, Unit Conversions and Shop Barcodes show an empty
state line and then the full add form. **Fix:** list first (empty state with one "Add Slot Rule" secondary button), the form in a sheet;
the page then reads as a list of rules, which is what a returning User looks for.

**S-04 Low: Shop detail entity actions.** "Rename" and "Delete Shop" are loose text actions under the title at equal weight. Move them to
the `PageHeader` overflow (F-04); Delete keeps its ConfirmDialog.

**S-05 Low: Import.** Screen 19. Step tiles at 1036 px with a full-width FileDrop and textarea; in a narrow page the three steps read as
one flow. Coordinate with the AI Recipe import plan (`design/ai-recipe-import` worktree), which will rework this screen.

**C-01 (aside, not counted): Cook Mode at 2560** (23) keeps its 1100 px column centred in a 2560 px screen; fine for the kitchen tablet. If desktop Cook
matters, scale the step type with `clamp()` on the container width.

### 3.6 What passed (no action)

- Sign-in at all sizes (centred card, max 400); the 404 page; offline states were not re-tested (QA round 2 covered them).
- Rail at 1024–1280 (not clipped, K2), bottom bar centred at 820 (max 480), avatar menu inside the viewport at all sizes.
- Dialogs ≥ 768 are 560 px and centred (P8: 0 failures); the Shop range and Meal Slot selects open as anchored popovers from 820.
- Dark mode: tiles, status tiles, chips and the hero hold up at all sizes; no light-only colours found (except L-04; the board's light
  tiles by day are intended, L-11).
- No sideways scroll on any route at any width (P1: 0 failures); the Recipes Tag row scrolls by design with a fade edge.

### 3.7 Decided (user)

Decisions taken after the first draft of this review. They are part of the spec; teams do not reopen them.

| Topic | Decision | Owner |
|---|---|---|
| Kitchen board scheme (L-11) | Follows sunset only, never a User's Dark choice. No action. | — |
| Member avatar (K3) | Photo, emoji or initials. Emoji and initials now; photo later via the shared `ImagePicker`. | R11a now; photo with `ImagePicker` |
| Meal Slots: multi-day edit | Editing a Meal Slot "on several days" changes the **matching** Meal Slots: those with the **same Meal Slot name on each chosen weekday**. A chosen weekday with no Meal Slot of that name is **skipped** (nothing is created), and the sheet says so after saving, e.g. "Updated Dinner on Mon, Tue, Thu. Wed has no Dinner, so it was skipped." | Meal Slots team (R15) |
| Meal Slots: weekday choice | A shared `ui/WeekdayPicker` primitive renders the seven weekdays as filter **chips** (multi-select, Monday first per locale, short labels "Mon"…, full names as accessible labels). Used by the Meal Slot sheet and anywhere else a set of weekdays is chosen (Slot Rules); no screen builds its own. | R15 builds it in `ui/` (PM-serialised shared file) |
| Meal Slots overview: attendees | Each Meal Slot row on the Meal Slots overview shows its Attendance as Member **pills** (avatar + first name, `+N` past four), so the User sees who eats when without opening the sheet. | R15 |
| Recipe editor "Optional" (E-01) | A visible label or chip, never a tooltip-only icon. | R2-1 |
| Import ownership | `features/import/**` is serialised: the Recipe Assistant's **WP-E and WP-G first**, then R2-4's import items (S-02 import part, S-05). | PM |

---

## 4. Check against ui-fix-plan.md

| Fix plan item | Result on main |
|---|---|
| 3.1 tokens, tinted ground, near-white tiles, dark mode | Done |
| 3.4 / 4.1 Phosphor icons | Done (S-01 gaps in the menu) |
| 4.2 button hierarchy | Done; full-width rule missing for desktop (F-03) |
| 4.4 tiles content-sized, never a button | Done |
| 4.5 rail 88 / 240, bottom bar, chromeless | Done; L-04 contrast at ≥ 1440; rail order (K5) |
| 4.6 / 4.7 Dialog, sheet as dialog ≥ 768 | Done; G-02 handle |
| 4.9 / 4.10 crafted fields, no native controls | Done (QA: 0 native controls), but no sizing (F-01), one native fieldset frame (F-05) and a doubled focus ring (F-09); TimeField fixed by U1 (K1) |
| 4.13 ListRow | Done; rows too wide on desktop (L-06) |
| 2.4 Plan 2 / 4 / 7 columns | Done; 7 columns too narrow in 1036 px (L-05) |
| 5.9 Recipe detail sticky Start Cook Mode | Done; detached bar (L-03), single column on desktop (D-01) |
| 5.10 Recipe editor "Ingredient lines as rows" | **Not done**: lines are 4-row cards (E-01) |
| 5.12 Cook Mode: step tile fills the height | Done ≥ 820; not on phone (L-08) |
| 5.14 Settings index + sub-pages | Done; widths inconsistent (L-06), duplicate Planner Style control (F-06) |
| 5.15 Ingredients/Products/Shops as ListRows | Done; Ingredient detail F-05 |
| (new) wide screens ≥ 1440 | Not designed in the fix plan; this review's L-01 |

---

## 5. Work packages, owners and order

`web/src/ui/*`, `web/src/app/*`, `web/src/styles.css` are shared files (PM-serialised). Existing teams take the items that sit in files
they already own; two new packages build the primitives; screen adoption then runs in parallel per feature folder.

| WP | Items | Files | Owner |
|---|---|---|---|
| **now: R11a** (add to its branch) | K2, K3, K5, **L-04** | `app/nav.ts`, `app/shell.css` (rail rule only), `ui/Breadcrumbs`, `PageHeader`, settings pages, `IngredientScreen.tsx` (h1) | R11a |
| ~~now: U1~~ **merged `8c1c72e`** | K1 | `ui/fields/{Field,TimeField,DateField}.css`, `ui/Select/Select.css` | U1 (done; K1 follow-ups (b)–(d) go to R2-F) |
| **now: A1** | **F-02** (Allowlist page) | `features/settings/…/Allowlist*`, `features/access/**` | A1 (PM to confirm) |
| **now: R12** | (no new items; it must merge before E-01, L-07, L-08 because it edits `TonightHero`, Cook, `recipes/lib/draft.ts`) | | R12 |
| **R14 inline Ingredient creation** | **F-09** (sheet layout, Base Unit `Segmented` with default, Shelf Life, inline validation, `FormActions`; photo when the backend field exists) | `features/ingredients/components/NewIngredientSheet.*`, `features/ingredients/strings.ts`, `.new-ingredient__*` in `ingredients.css` | R14; adopts R2-F's focus ring and `FormActions` when R2-F merges; **serialise with R2-3 on `ingredients.css`** |
| **R15 Meal Slots** | Decisions in 3.7: multi-day edit by matching name, `ui/WeekdayPicker`, attendee pills on the overview | `features/settings/**` Meal Slots screens and sheet, new `ui/WeekdayPicker.*`, `ui/index.ts` | R15; `ui/index.ts` serialised with R2-F/R2-L by the PM; Meal Slots files serialised with R2-3 |
| **R2-F Field sizing** (new, "UI foundations" team) | F-01 (primitives), F-03, F-04 (`FormActions`), G-02, **F-09 focus ring** (`--focus-ring`, one ring for every field control), Segmented label + fieldset reset (F-05/F-09), K1 follow-ups (TimeField `sm`, group focus, disabled colours) | `styles.css` (`--focus-ring`), `ui/fields/FieldFrame.tsx` + `Field.css` (`data-size`, focus), `ui/fields/{SearchField,DateField,TimeField,Segmented}.css`, `ui/Select/Select.css`, `ui/fields/field-css.test.ts`, `ui/fields/NumberField.tsx`, `ui/Stepper.*`, new `ui/fields/FieldRow.*`, `ui/Button.*` (`block`), new `ui/FormActions.*`, `ui/BottomSheet.css`, `ui/Dialog.tsx` (footer), `ui/index.ts`, `ui/Gallery*` | new team; **can start now** (U1 merged) |
| **R2-L Page layout** (same team, after R2-F) | L-01, L-03 (`StickyActionBar`), G-01 (`Menu`), L-12 | `styles.css` (page tokens), `app/shell.css` (`.app-main` width), `app/AppShell.tsx` (if the brand moves), new `ui/Page.*`, `ui/StickyActionBar.*`, `ui/Menu.*`, `ui/index.ts` | same team, **after R11a and A1 merge** (they edit `PageHeader`, `nav.ts`, `AppShell.tsx`, `YourMenu.tsx`) |
| **R2-1 Recipes** | L-02, E-01, E-02, E-03, D-01, D-02, F-01 adoption in the editor, S-02 (recipes part) | `features/recipes/**` | **future Recipe-editor-features team**, after R12 + R2-F + R2-L |
| **R2-2 Today + Plan** | L-05, L-07, K4 | `features/today/**`, `features/plan/**` (not `PlanningRulesScreen`/`RulesEditors`) | **future Couldn't-plan team**, after R12 + R2-L |
| **R2-3 Settings + catalogue** | L-06 (settings, ingredients, products), F-05, F-06, F-07, F-08, S-01, S-03, S-04, S-02 (Products part), F-01 adoption | `features/settings/**`, `features/ingredients/**`, `features/products/**`, `features/shops/**`, `features/notifications/**`, `plan/screens/PlanningRulesScreen.tsx`, `plan/components/RulesEditors.tsx`, `app/nav.ts`/`YourMenu.tsx` (S-01) | R11a's follow-up (or a new team), after R11a + A1 + R2-F + R2-L; **serialise with R2-2 on `plan/plan.css`** |
| **R2-4 Stock, Shop, Scan, Import, Cook, board** | L-06 (Stock two-column, Scan picker, the /recipes/export screen), L-08, L-09, L-10, S-02 (Shop and Import parts), S-05 | `features/stock/**`, `features/shop/**`, `features/scan/**`, `features/import/**`, `features/cook/**`, `features/board/**` | small new team, after R2-L; Cook part after R12; **Import part after the Recipe Assistant's WP-E and WP-G** (both own `features/import/**`; serialised, Recipe Assistant first) |

**Serialisation order**

1. In parallel, as planned: **R11a** (+ L-04, K3 emoji/initials), **A1** (+ F-02), **R12**, **R14** (+ F-09 sheet), **R15** (Meal Slots
   decisions). **U1 is merged** (`8c1c72e`).
2. Now (U1 merged): **R2-F** field sizing and the single focus ring (shared `ui/fields`, `styles.css`, `ui/index.ts`). R15's
   `ui/WeekdayPicker` export and R2-F both edit `ui/index.ts`: the PM serialises those commits. R14 adopts the focus ring and
   `FormActions` after R2-F.
3. After R11a + A1 + R2-F: **R2-L** page layout (`styles.css`, `app/shell.css`, `ui/index.ts`). R2-F and R2-L are one team in sequence
   because both edit `ui/index.ts` and the Gallery.
4. After R2-L (and R12 for 4a/4b and the Cook part of 4d), in parallel: **4a R2-1 Recipes**, **4b R2-2 Today + Plan**, **4c R2-3 Settings +
   catalogue**, **4d R2-4 Stock/Shop/Scan/Import/Cook/board**. 4b and 4c share `plan/plan.css`: the PM serialises those two commits. 4c and R14
   share `ingredients.css`, 4c and R15 the Meal Slots settings files: serialised. 4d's import items wait for the Recipe Assistant's
   WP-E and WP-G (`features/import/**`).
5. Guards: add `check-page-layout` in **warn** mode with R2-L; each adoption WP flips its routes to **fail** when it merges.

---

## 6. Layout guards (proposal)

`scripts/check-shell-layout.mjs` (WP5) fakes the API and checks the shell at 390/820/1280/1440. Keep it, and extend it:

- **Viewports:** add 1920×1080 and 2560×1440 to `VIEWPORTS` (assertions 1–10 hold there too; today they pass).
- **Rail contrast (P7):** at ≥ 1024 compute the contrast of the current rail item's `color` against its effective background; ≥ 4.5.
  This alone would have caught L-04.

Everything that needs real content (fields, sticky bars, page widths) goes in a second script that runs against a seeded server with dev
login: the draft **[ui-review-2/check-page-layout.draft.mjs](ui-review-2/check-page-layout.draft.mjs)** (same raw-CDP approach as the shell
script, no new dependency, not wired into `check.sh`). Per route × 390/820/1180/1440/1920/2560:

| Rule | Assertion | Today |
|---|---|---|
| P1 | no sideways scroll; no visible element past the right edge outside a horizontal scroller | 0 |
| P2 | ≥ 1024: content centred in the area right of the rail, \|offset\| ≤ 24 px | 12 (editor, detail) |
| P3 | ≥ 1024: content width ≤ the route's page width (narrow 720, default 1120, wide 1480) + 40 | 64 |
| P4 | ≥ 820: numeric/decimal/spinbutton fields ≤ 240 px unless `data-size="full"` | 125 |
| P5 | text/email/search/url inputs ≥ 160 px | 6 (Allowlist) |
| P6 | sticky/fixed bars in `main` with buttons are opaque and line up with the page container (`[data-page-width]`) ± 4 | 18 |
| P7 | current rail item contrast ≥ 4.5 | 3 (/scan ≥ 1440) |
| P8 | ≥ 768: open dialog ≤ 600 px and centred ± 2 | 0 |

To make it a check: it needs a seeded server, so run it from a `scripts/test/page-layout_test.sh` that builds, starts the binary
detached on a worktree-unique port (derived from the worktree path; the draft has no default port and requires `--url`) with a temp
`FEEDER_DATA_DIR`, seeds via a small fixture script (the review seeder, committed under
`scripts/test/fixtures/`), runs the guard, and stops the server; warn-only until R2-L lands. The route→width table in the script is the
contract that `ui/Page` implements; P6 starts passing only once `ui/Page` sets `data-page-width`.
