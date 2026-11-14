# Recipes list: the filter header (hotfix hf-recipes-filter)

Status (beta.8): **several Tags at once, tests red** ([§16](#16-beta8-several-tags-at-once)); the hotfix itself is **round 3** (2026-11-13; round 1 built in bb354d3c, round 2 in f0d5a84c, both sent back by review, see
[§13](#13-round-2-after-the-review-of-bb354d3c) and [§14](#14-round-3-the-chip-line-must-settle)). Release: a hotfix on 1.0.0-beta.6. Domain words come from
[GLOSSARY.md](../../GLOSSARY.md); the rules from [system.md](system.md) and [ADR 0016](../adr/0016-design-system-rules-enforced.md).

## 1. The problem

The user, with a screenshot of `/recipes`: "we have many tags, so nothing shows, also it's broken in multiple lines and can be
simplified and made easy to use".

Today the header stacks five rows: Search; a visible "Kind" label over a full-width Recipes / Base recipes control; one row of
every Tag as a filter chip; a row of Course chips with no label; a visible "Sort" label over a 320 px Select.

- **The Tag row is unusable.** The row is `overflow-x: auto` and its chips are `flex: 0 1 auto; min-inline-size: 0`, so with
  about 25 Tags every chip shrinks until its label is gone: each Tag is a coloured dot with no name, and "All Tags" is a lone
  tick. The rest of the Tags are off screen. No guard rule saw it: the row is a scroll container (not P1/P13), and it is
  really full (not P14).
- **The labels are inconsistent**: "Kind" and "Sort" are labelled, the Course row and the Tag row are not.
- **The rows are cramped** and the header takes a third of a phone screen before the first Recipe.

## 2. Decisions

1. **Two short rows, always the same structure, at every width.** Search and the Filters button share row 1; Kind and Sort share
   row 2. Every row is one line (`flex-wrap: nowrap`) at 390, 834, 1024, 1440 and 1920 px. A third line, the active filter
   chips, shows only while a filter is on.
   - Why Filters sits beside Search and not beside Kind (the lead's starting point): at 390 px, Kind (about 194 px) + "Filters 2"
     (about 120 px) + the Sort chip (about 150 px) need about 480 px of a 358 px row. Search + Filters and Kind + Sort both fit.
2. **Course and Tag move into a Filters panel**: a popover anchored to the button from 768 px, a bottom sheet below 768 px (the
   same breakpoint as `Select`). The list behind it stays as it is.
3. **The Tag filter is a searchable list**, one row per Tag with its name, its Tag colour dot and its Recipe count. The selected
   Tag comes first, then the others by name.
4. **The Tag filter takes several Tags (beta.8, [§16](#16-beta8-several-tags-at-once)).** It was single-choice in the hotfix
   (`?tag=<name>`, `RecipeFilter.tag: string`, `ListFilter.Tag string`). Since beta.8 the Tags are **ANDed** (a Recipe must carry
   every selected Tag): `?tag=a&tag=b`, `RecipeFilter.tags`, `ListFilter.Tags`. The list is a multi-select listbox; choosing a
   selected Tag again removes it. A single `?tag=x` URL works as before.
5. **The Course filter moves into the URL** (`?course=<id>`), beside `tag`, `kind` and `sort`, so a link and the back button
   bring it back. It used to be component state and was lost on the way back from a Recipe.
6. **Active filters are chips you can remove**, one line under row 2, each naming its Course or Tag.
7. **Every existing behaviour stays**: Kind in `?kind=base`; Base recipes have no Sort and no Course filter; the Sort in `?sort=`
   and remembered on the device; `?tag=` (the Recipe detail's Tag links open the list filtered); Show archived in the More menu;
   search as you type. Every URL change replaces the history entry (as today), so Back leaves the list instead of undoing filters,
   and coming back to `/recipes?...` restores them.

## 3. Layout per width

```
 phone 390                                  tablet 834 / 1024, desktop 1440 / 1920
 ┌──────────────────────────────────────┐   ┌────────────────────────────────────────────────────────────────┐
 │ Recipes                [+ New] [⋮]   │   │ Recipes                                     [+ New Recipe] [⋮]  │
 │ [🔍 Search Recipes     ] [⚲ Filters 2]│   │ [🔍 Search Recipes                                 ] [⚲ Filters 2]│
 │ [Recipes|Base recipes]   [↕ Name ▾]  │   │ [Recipes | Base recipes]                                [↕ Name ▾]│
 │ (Main ×) (● fish ×)                  │   │ (Main ×) (● fish ×)                                             │
 └──────────────────────────────────────┘   └────────────────────────────────────────────────────────────────┘
```

- **Row 1** (`.recipe-filters__search-row`): the SearchField takes the free space (`flex: 1 1 auto; min-inline-size: 0`); the
  Filters button keeps its natural width (`flex: none`).
- **Row 2** (`.recipe-filters__view-row`): Kind at the start, Sort at the end (`justify-content: space-between`). Kind keeps its
  natural width; the Sort chip may shrink, its value ending in an ellipsis (it never pushes the row wider).
  - On Base recipes, row 2 is Kind alone (no Sort, as today).
- **Row 3** (`.recipe-filters__chips`): only while a filter is on. One line (`flex-wrap: nowrap; overflow: hidden`). The chips
  that fit, then "+N" for the rest (§5.4).
- Every row: `display: flex; flex-wrap: nowrap; align-items: center; gap: var(--space-2); min-inline-size: 0`. Rows are spaced
  by the ListPage slot gap.
- **The panel**: below 768 px a BottomSheet titled "Filters" (full width, its body scrolls, its footer sticky). From 768 px a
  popover under the button, end-aligned to it, `inline-size: min(24rem, 100vw - 2 * var(--space-4))`, its Tag list scrolling
  inside a `max-block-size` so the popover never runs off the viewport.

| Width | Row 1 | Row 2 | Panel |
|---|---|---|---|
| 390 | Search (~220 px) + Filters | Kind (~194 px) + Sort chip (shrinks) | Bottom sheet |
| 834, 1024 | Search + Filters | Kind … Sort | Popover |
| 1440, 1920 | Search + Filters | Kind … Sort | Popover |

## 4. Components

Components only render and wire events (CLAUDE.md). Logic lives in `lib/recipeFilters.ts` and the hooks of §6.

| Component | Where | What it is |
|---|---|---|
| `RecipeKindControl` | features/recipes/components | Unchanged API. Now `Segmented compact labelHidden` (radiogroup "Kind"). |
| `RecipeSortSelect` | features/recipes/components | Unchanged API. Now `Select appearance="chip" icon="sort"` with short trigger labels (§9). |
| `RecipeFiltersButton` | features/recipes/components | **New.** `Button variant="secondary" size="sm" icon="filter"`, text "Filters", and a count Chip while filters are on. `aria-haspopup="dialog"`, `aria-expanded`, `aria-label` from the summary. |
| `RecipeFiltersPanel` | features/recipes/components | **New.** The shared `Popover` titled "Filters": a "Course" section (`CourseFilter`, one line) unless `bases`; a "Tag" section (`TagFilterList`); footer "Clear filters" and "Show Recipes". |
| `CourseFilter` | features/recipes/components | Unchanged API; group name "Filter by Course"; no "All Courses" chip since beta.6.2 (§15). Its group is **one line**: it scrolls sideways inside the panel, chips keep their natural width (never crushed). |
| `TagFilterList` | features/recipes/components | **New.** The shared `OptionList` (`multiple` since beta.8) fed by `useTagFilterSearch`: search, rows, empty text. |
| `ActiveFilterChips` | features/recipes/components | **New.** The chip line of row 3: removable chips (`Chip onRemove`) and the "+N" chip, fitted by `useFittingChips`. |
| `TagChips` | features/recipes/components | **Removed** (and its tests): its only caller was this header. |

`RecipesScreen` composes them: `search` slot = row 1, `filters` slot = rows 2 and 3, and the panel.

## 5. States

### 5.1 No filter
Row 1, row 2; no row 3. The button reads "Filters" with no count. In the panel no Course chip is pressed, no Tag is selected,
"Clear filters" is disabled.

### 5.2 Some filters (a Course and/or a Tag)
The button reads "Filters" and a count chip "1" or "2". Row 3 shows "Main ×" (neutral chip) and/or "● fish ×" (the Tag's
colour). The panel shows the Course pressed and the Tag selected, first in the list with a tick.

### 5.3 Many Tags (25 and more)
Nothing changes in the header: no Tag shows there until one is chosen. The panel's Tag list scrolls inside its own box; the
search field stays on top. Each row: `[● dot] fish ............ 3 Recipes`, name in `body-strong`, count in `meta`.

### 5.4 The chip line overflows
Only possible with long names on a phone. The chips that fit show in full, in order (Course, then Tag); the rest collapse into
"+N", which opens the panel. At least one chip always shows; a single chip wider than the line ends in an ellipsis, with its
full name in its tooltip and accessible name. A chip is never narrower than its "×" and four characters (`min-inline-size`).

- **Only the first chip may ever be cut.** Any later chip that does not fit at its natural width goes into "+N"; it is never shown
  cut. Example, 390 px, `?course=2&tag=extraordinarily long family favourite weeknight tag`: the line shows "Side ×" and "+1".
- **Natural widths.** The chips are measured in a copy of the line that holds the **real removable chips** (the same `Chip
  onRemove` markup, label and close icon) under `inert` and `aria-hidden`, laid out at `inline-size: max-content` with `flex: none`
  chips, so nothing in the copy shrinks. No width is added by hand (no "remove allowance" constant).

### 5.5 Empty Tag search
The list shows one line, "No Tag matches 'xyz'" (`meta`, muted), in place of the rows; the search keeps its text and its
Clear button. A household with no Tags at all shows "No Tag to choose from".

### 5.6 Base recipes
The Course section is not in the panel, a Course in the URL is kept but not applied, not counted and not shown as a chip (as
today, Base recipes ignore the Course filter). The Tag filter applies to Base recipes as it does today.

### 5.7 A Course or Tag in the URL that no longer exists
- `?course=<id>` not among the household's active Courses (archived, deleted, or a single-Course household): ignored, as if
  absent. It is not sent to the server, not counted, no chip.
- `?tag=<name>` that is not a known Tag: still applied (the server matches by key, and the detail links here); its chip shows
  the name from the URL, and the panel lists it first, selected, with "No Recipes yet".

## 6. Libraries and hooks (the pinned API)

`web/src/features/recipes/lib/recipeFilters.ts`, plain TypeScript:

```ts
export interface RecipeFilterState { kind: 'plannable' | 'base'; course: number | null; tag: string }
export function filtersFromParams(params: URLSearchParams, courses: readonly CourseChoice[]): RecipeFilterState
export function withCourse(params: URLSearchParams, id: number | null): URLSearchParams
export function withTag(params: URLSearchParams, name: string): URLSearchParams
export function withoutFilters(params: URLSearchParams): URLSearchParams
export interface ActiveFilterChip { key: 'course' | 'tag'; label: string; removeLabel: string; tagColour?: string }
export function activeFilterChips(state: RecipeFilterState, ctx: { courses: readonly CourseChoice[]; known: readonly TagCount[];
  colourOf?: (name: string) => string | undefined }): ActiveFilterChip[]
export function filtersButtonLabel(count: number): string
export interface TagFilterRow { name: string; recipes: number; colour?: string; selected: boolean }
export function tagFilterRows(known: readonly TagCount[], selected: string, query: string,
  colourOf?: (name: string) => string | undefined): TagFilterRow[]
export function fitChips(widths: readonly number[], available: number, gap: number, plusWidth: number): { visible: number; hidden: number }
```

- `filtersFromParams`: `kind` as `kindFromParams`; `course` a positive integer among `courses` while there are at least two,
  else null; `tag` trimmed, '' when absent. `kind = 'base'` keeps the parsed course (it is simply not applied: `activeFilterChips`
  and the screen's `RecipeFilter` skip it).
- `withCourse` / `withTag` set or delete their parameter on a copy; `withoutFilters` deletes `course` and `tag` only (kind, sort,
  anything else kept).
- `activeFilterChips`: Course first (only on Recipes), then Tag. A Tag chip's label is the known spelling of the Tag (matched by
  key), else the URL's.
- `tagFilterRows`: matching is accent- and case-blind, every word of the query must appear in the name; the selected Tag
  (matched by key) comes first, the others by name as `sortTagsByName` orders them (accents and case ignored, numeric).
- `fitChips`: all chips when they fit with their gaps; otherwise as many as fit **with** a gap and the "+N" chip, at least one.

Hooks:

```ts
// hooks/useRecipeFilters.ts (inside a router)
export interface UseRecipeFilters {
  kind: 'plannable' | 'base'; setKind(kind: 'plannable' | 'base'): void
  course: number | null      // the Course in force: null on Base recipes or when not a known Course
  setCourse(id: number | null): void
  tag: string; setTag(name: string): void   // '' clears; choosing the selected Tag again clears it
  chips: ActiveFilterChip[]; count: number
  remove(key: 'course' | 'tag'): void
  clear(): void
}
export function useRecipeFilters(courses: readonly CourseChoice[], known: readonly TagCount[],
  colourOf?: (name: string) => string | undefined): UseRecipeFilters

// hooks/useTagFilterSearch.ts
export function useTagFilterSearch(known: readonly TagCount[], selected: string, colourOf?: (name: string) => string | undefined):
  { query: string; setQuery(q: string): void; rows: TagFilterRow[]; emptyText: string | null }

// hooks/useFittingChips.ts
export interface ChipLineMetrics { available: number; widths: number[]; gap: number; plusWidth: number }
export function useFittingChips(line: RefObject<HTMLElement | null>, count: number,
  measure?: (el: HTMLElement) => ChipLineMetrics): { visible: number; hidden: number }
```

Every setter writes the URL with `{ replace: true }`, keeping the other parameters. `useFittingChips` measures after layout and
on resize (ResizeObserver when present); without a measurement (jsdom) every chip is visible.

## 7. Shared ui changes (`web/src/ui`)

1. **`Popover`** (new, `ui/Popover/Popover.tsx`, exported from `ui/index.ts`). `{ open, onClose, anchorRef, title, children,
   footer? }`. From 768 px a non-modal `role="dialog"` named by its visible title, floated with `useFloatingPopover` (top layer),
   end-aligned under the anchor (its end edge on the anchor's end edge, kept inside the page gutter: `placePopover({ align:
   'end', margin })`, where `margin` is `--space-4`, 16 px); Escape and an outside click close it and return focus to the anchor; on open, focus moves to the
   first interactive element of the body. Below 768 px it renders a `BottomSheet` with the same title and footer.
2. **`OptionList`** (new, `ui/Select/OptionList.tsx`, exported). An inline, always-open listbox with a search field on top: the
   panel part of `Select` without its trigger. `{ label, searchLabel, query, onQueryChange, options: SelectOption<V>[],
   selected: V[], onToggle(value: V), emptyText?: string | null }`. The search field is a `combobox` (`aria-expanded="true"`,
   `aria-controls`, `aria-activedescendant`); ArrowUp/Down, Home/End move the active option, Enter toggles it; a click toggles.
   It does not filter or order: the caller passes the options to show. The search field's placeholder is its `searchLabel`
   ("Search Tags"). The active option scrolls into view (`scrollIntoView({ block: 'nearest' })`) whenever it changes.
3. **`Segmented`**: `labelHidden?: boolean` (the label stays the radiogroup's name, visually hidden, as Select's chip does) and
   `compact?: boolean` (`data-compact`: the group is as wide as its options, `inline-size: max-content`, options `flex: none`
   with `--space-2` padding; height stays 40 px).
4. **`Chip`**: `onRemove?: () => void` and `removeLabel?: string`. A removable chip is one `<button>` (`data-removable`) named
   by `removeLabel`, its label then a trailing 14 px `close` icon; it keeps its kind's look (a Tag colour on `kind="tag"`), one
   line, ellipsis, full text in `title`. It has a 44 px hit area (`::before` inset), so the 26 px chip is still easy to tap.

No other ui file changes.

## 8. Keyboard and screen reader

- Tab order: Search → Filters → Kind (one tab stop, arrows move, as today) → Sort → each chip in row 3 → "+N" → the list.
- **Filters button**: `aria-haspopup="dialog"`, `aria-expanded` true while the panel is open, `aria-controls` the panel.
  Its name is the summary: "Filters" or "Filters, 2 active". The count chip is `aria-hidden`.
- **Panel**: a dialog named "Filters". On open, focus goes to the first Course chip, or to the Tag search on
  Base recipes. Escape closes it and focus returns to the Filters button. On a phone it is the modal BottomSheet (focus
  trapped; the backdrop and the header's ✕ IconButton ("Close") dismiss it). The footer "Show Recipes" button closes it the same
  way, on every width; its name differs from the ✕ so a phone sheet never has two buttons named "Close".
- **Course group**: "Filter by Course", toggle buttons (`aria-pressed`), as today.
- **Tag list**: a search combobox "Search Tags" over a listbox "Filter by Tag" (`aria-multiselectable="true"` since beta.8); each
  option is named by the Tag's name and described by its count ("3 Recipes"); `aria-selected` on every chosen Tag. The colour
  dot is decorative.
- **Chips**: buttons named "Remove Course: Main" and "Remove Tag: fish"; activating one removes the filter and moves focus to the
  next chip, or to the Filters button when it was the last. "+N" is a button named "Show 1 more filter" / "Show 2 more filters"
  that opens the panel.
- **Clear filters**: removes the Course and every Tag, keeps the panel open, focus stays on it (it becomes disabled, so focus
  moves to "Show Recipes").
- Kind: radiogroup "Kind" (label visually hidden). Sort: combobox "Sort" (label visually hidden), its value the short label.

## 9. Copy

| Where | Text |
|---|---|
| Search | "Search Recipes" (unchanged) |
| Filters button | "Filters"; accessible name "Filters" / "Filters, 1 active" / "Filters, 2 active"; count chip "1", "2" |
| Panel title | "Filters" |
| Course section heading | "Course"; group name "Filter by Course"; one chip per Course, no "All Courses" (§15) |
| Tag section heading | "Tag" |
| Tag search | label and placeholder "Search Tags" (not the SearchField default "Search") |
| Tag listbox | "Filter by Tag" |
| Tag row meta | "1 Recipe", "3 Recipes", "No Recipes yet" (`tagColourStrings.recipes`) |
| Empty Tag search | "No Tag matches 'xyz'" |
| No Tags | "No Tag to choose from" |
| Panel footer | "Clear filters", "Show Recipes" ("Done" is a GLOSSARY _Avoid_ word; "Close" is the sheet's ✕) |
| Course chip | visible "Main"; name "Remove Course: Main" |
| Tag chip | visible "fish"; name "Remove Tag: fish" |
| More chip | "+1", "+2"; name "Show 1 more filter", "Show 2 more filters" |
| Kind | radiogroup "Kind" (hidden), "Recipes", "Base recipes" (unchanged) |
| Sort | combobox "Sort" (hidden). Trigger: "Name", "Longest ago", "Most recent". Options unchanged: "Name", "Last cooked: longest ago first", "Last cooked: most recent first" |

No word from GLOSSARY's _Avoid_ lists ("category", "label" for a Tag; "dish type" for a Course).

## 10. Colour and type

- New Recipe stays the one accent action of the page. Filters is `secondary`; the count is `Chip kind="count"`; "Show Recipes" is
  `secondary` and "Clear filters" `tertiary` (the panel has no accent).
- The Course chip is neutral (`kind="tag"` with no colour). A Tag chip carries its Tag colour; the Tag list's dot is `TagDot`.
- Section headings in the panel are `label` (`--text-label-*`). Feature CSS uses only `--text-*`, `--space-*` and colour tokens.

## 11. Tests (red)

| Kind | Files |
|---|---|
| Library | `lib/recipeFilters.test.ts` |
| Hooks | `hooks/useRecipeFilters.test.tsx`, `hooks/useTagFilterSearch.test.tsx`, `hooks/useFittingChips.test.tsx` |
| Components | `components/RecipeFiltersButton.test.tsx`, `RecipeFiltersPanel.test.tsx`, `TagFilterList.test.tsx`, `ActiveFilterChips.test.tsx`, `RecipeKindControl.test.tsx`, `RecipeSortSelect.test.tsx` |
| Screen | `screens/RecipesScreen.filters.test.tsx` (structure, find and select a Tag, chips, Clear, URL round trip, back button), and the updated `RecipesScreen{,.tags,.course,.kind,.sort}.test.tsx` |
| a11y | `screens/RecipesScreen.filters.a11y.test.tsx` |
| CSS contract | `recipes.filters.css.test.ts` (one-line rows, chip line, Course group one line, panel sizes) |
| ui | `ui/Popover/Popover.test.tsx`, `ui/Select/OptionList.test.tsx`, `ui/fields/Segmented.compact.test.tsx`, `ui/Chip.remove.test.tsx`, `ui/index.filters.test.ts` |
| Guard | `web/src/app/pageLayoutRules.p16.test.ts`, `scripts/test/page-layout-recipes-header_test.sh` + `fixtures/page-layout-recipes-header/`, and 28 Tags in `page-layout-seed.mjs` |

**Guard rule P16 (new, always fails):** a chip whose label is crushed: visible, cut by its ellipsis, and narrower than 24 px
(about two characters) while its text is longer. It catches the reported bug (a Tag chip shrunk to its dot) whether or not its
line is full; P14 only sees chips cut while their line has room.

## 12. Not in this hotfix

- **Several Tags at once.** Done in beta.8, as AND: see [§16](#16-beta8-several-tags-at-once).
- Search in the URL (it stays component state, as today).

## 13. Round 2 (after the review of bb354d3c)

The reviewer checked the real build in a browser (390 and 1440 px, panel open and closed). Round 2 keeps the design and fixes
how it is built. Every user-facing string is in `recipeStrings` (§9); the footer button is "Show Recipes". The keys are
`recipeStrings.filters.removeCourse(name)`, `removeTag(name)`, `buttonLabel(count)`, `noTagMatch(query)`, `noTags`,
`tagSearch` and `showRecipes`; `lib/recipeFilters.ts` and `hooks/useTagFilterSearch.ts` hold no copy of their own.

1. **Overflow is measured at natural widths** (§5.4). Round 1's hidden copy was `inset-inline: 0` with `flex: 0 1 auto` chips, so
   it measured shrunk widths, then added a hand-made 20 px "remove allowance"; at 390 px both chips showed, the Tag cut.
   - The copy (`.recipe-filters__measure`) is `inert`, `aria-hidden`, `inline-size: max-content`, its chips `flex: none`, and
     holds the real removable chips.
2. **Focus rings and hit areas are never clipped.** The 3 px outline (+2 px offset) of a removable chip and of "All Courses", and
   a removable chip's 44 px hit area (`::before`, 9 px above and below), stay inside every clipping ancestor.
   - `.recipe-filters__chips` does not use `overflow: hidden`. (Nothing past the fitted chips is rendered, so it needs no
     clipping; if it clips, it is `overflow: clip` with `overflow-clip-margin` of at least 9 px.)
   - `.course-filter` scrolls sideways, so it is padded on both axes by at least 5 px (`--space-2`) with a matching negative
     margin, so its chips still line up with the heading.
3. **Spacing.**
   - Row 3 sits one slot gap (`--space-4`, the ListPage gap) below row 2 at every width: the Recipes filters slot is a grid
     with that gap (`.recipes-screen .list-page__filters`).
   - The panel's sections are spaced by the panel's own wrapper, `.recipe-filters__body` (`flex` column, `gap: var(--space-4)`),
     so the bottom sheet (which has no `.popover__body`) spaces "Tag" from the Course chips too. recipes.css never styles
     `.popover__body`.
4. **OptionList keyboard scrolling**: the active option scrolls into view, `block: 'nearest'` (§7.2).
5. **Popover alignment**: from 768 px the popover's end edge is the Filters button's end edge (±1 px) and the popover stays
   inside the page content box (§7.1).
6. **Browser coverage (page-layout guard).**
   - New always-failing rules:
     - **P17** a chip line that fits chips with "+N" (`.recipe-filters__chips`) shows a cut chip that is not its first, or a
       chip that runs past the line;
     - **P18** a focus ring or a hit area cut by a clipping ancestor (`overflow` other than visible, plus `overflow-clip-margin`),
       for the chips of `.recipe-filters__chips` and `.course-filter`; a chip scrolled partly out of its own scroll container
       is skipped;
     - **P19** an open `.popover` whose end edge is not its trigger's (the element with `aria-controls` = its id), or that
       leaves the page content box (from 768 px);
     - **P20** Recipes filter spacing: row 3 not one slot gap below row 2, or two panel sections closer than `--space-3`.
   - **Scenarios**: besides `/recipes`, the guard probes `/recipes?course=<Side>&tag=<a long Tag>` (row 3 and "+N"), and the
     same URL with the Filters panel open (the sheet below 768 px, the popover from 768 px), on the real build. The seed writes
     `sideCourseId` and `longTag` to the ids file.
   - The static fixtures (`scripts/test/fixtures/page-layout-recipes-header/`) prove each probe: `crushed.html` (P16),
     `round1.html` (the bb354d3c defects: P17, P18, P19, P20) and `fixed.html` (the round-2 layout: clean).

## 14. Round 3: the chip line must settle

The review of f0d5a84c found a blocker. The chip line measured its chips two ways: the shown chips while nothing was hidden
(`min-inline-size: 4.5rem`, so "Side" was 72 px), and the copy once a chip was hidden (no minimum, "Side" 64 px). With the line
width inside that gap, each fit flipped the answer, the layout effect looped, React threw #185 ("Maximum update depth exceeded")
and the page showed "Something went wrong". It happens on the guard's own filtered scenario at 430 px, and at 390 px with a
slightly shorter Tag; the guard's widths (390, 834, 1024, 1440, 1920) missed it.

1. **One measurement for both states.** The copy's chips have the same `min-inline-size` (and the same box) as the shown chips, so
   a chip's natural width is max(min, content) whichever way it is measured.
2. **Hysteresis.** `fitChips(widths, available, gap, plusWidth, current?)` takes the number of chips shown now. Hiding happens as
   soon as a chip does not fit; showing one more again needs `FIT_MARGIN` px to spare (exported from `lib/recipeFilters.ts`,
   8 to 16 px). The result is a fixed point: fitting again from its own answer gives the same answer. `useFittingChips` passes
   its current answer, so even two measurements that disagree by up to the margin settle in a bounded number of renders.
3. **Guard rule P21** (always fails): the page broke at a width. `RESIZE_WALK` = `{ scenario: 'recipes-filtered', from: 360,
   to: 480, step: 10 }`: the guard loads the closed filtered `/recipes` fresh at each of those 13 widths (phone emulation) and
   reports an uncaught exception (`Runtime.exceptionThrown`), a console error, or the error page ("Something went wrong").
   It runs once per guard run, at about a second per width.
4. **The panel body keeps its inline padding** (`.recipe-filters__body { padding-inline: var(--space-2) }`): the focus ring wins.
   The bottom sheet clips its body at its edge, and the Course line's own padding and negative margin (§13.2) pull "All Courses"
   back to the body's edge, so without the body's padding its focus ring is cut. The cost is that the panel's content starts
   `--space-2` inside its title and footer.

## 15. beta.6.2: no "All Courses" chip

The user: "Instead of 'All Courses' let's just have a logic where if no courses are selected all are shown, freeing space."

- `CourseFilter` shows one chip per Course and nothing else; `courseStrings.allCourses` is gone. The cooking timeline's own
  "All" chip (`cook/CourseFilterChips`) is a separate component and is unchanged.
- **No Course pressed means every Recipe** (no `?course=`), as before. Tapping a Course selects it (single choice; the one pressed
  before is released); tapping the selected Course again clears it.
- ARIA: the group stays `role="group"` "Filter by Course" of toggle buttons (`Chip kind="filter"`, `aria-pressed`); every chip
  is a tab stop and Space or Enter toggles it. The panel opens on the first Course chip.
- The active-filter chip, Clear filters, the Filters count and the URL are unchanged. The guard fixtures and §13.2/§14.4 now mean
  the first Course chip where they say "All Courses".

## 16. pantry-filter: the header is shared

The Pantry got the same header ([pantry-filter.md](pantry-filter.md)). What was generic moved out of Recipes, unchanged in behaviour:
`fitChips` and `FIT_MARGIN` to `lib/filters/fitChips.ts`; `useFittingChips`, `ActiveFilterChips`, `RecipeFiltersButton` (now
`FiltersButton`), the panel frame (`FiltersPanel`, `FilterSection`) and the CSS to `ui/FilterBar/`. The class names in this spec read
as their shared names: `.recipe-filters__row` → `.filter-bar__row` (and `__search-row`, `__view-row`, `__sort`),
`.recipe-filters__chips` → `.filter-chips` (`__more`, `__measure`), `.recipe-filters__panel` → `.filter-panel` (`__body`,
`__section`, `__heading`), `.recipe-filters__tags` → `.filter-panel__list`. The guard's probes (P17, P18, P20) read the shared names,
so they cover both headers. `fitChips` now shows every chip of a line that is not measured (0 px) whatever is shown now: a chip added
to an unmeasured line was held in "+N" by the margin.

The one visible change to Recipes (the user's decision in the Pantry review): **below 420 px the Sort chip has no leading sort icon**,
on both headers (`.filter-bar__sort .select__leading`), so the Pantry's "Good until" fits at 360 px. It also mends a beta.6.1 cut that
no rule saw: "Longest ago" and "Most recent" showed 58 of their 85 px at 360 px and were cut up to about 388 px; they now fit at 360 px.
The combobox is still named "Sort" and keeps its chevron.

## 16. beta.8: several Tags at once

**Decision (main session): AND.** A Recipe must carry **every** selected Tag. Each Tag narrows the list, as combining the Course
and a Tag does. (OR would widen with every Tag; it is not offered.) Full design: [b8-recipes](../dev/design/b8-recipes.md).

- **URL**: one `tag` parameter per Tag, in the order chosen: `/recipes?tag=fish&tag=oven`. A single `?tag=fish` (the Recipe
  detail's Tag links, old bookmarks) works as before. Blank values are ignored and a repeat (matched by key: case, spaces) counts once, the
  first spelling stays.
- **Server**: `GET /api/recipes?tag=a&tag=b` keeps the Recipes that carry both; the Tag match is by key as ever; `ListFilter.Tag`
  becomes `ListFilter.Tags []string`.
- **Panel**: the Tag list is multi-select. Choosing a Tag adds it and the panel stays open; choosing a selected Tag removes just it.
  Selected Tags come first, in the order chosen, then the others by name.
- **Chip line**: one removable chip per Tag, after the Course chip, each in its Tag colour ("Remove Tag: fish"). The chips that do
  not fit still collapse into "+N" (§5.4; only the first chip may be cut).
- **Count**: the Filters button counts the Course plus every Tag ("Filters, 3 active").
- **Clear filters** removes the Course and every Tag.
- **Base recipes** take the same Tags.
