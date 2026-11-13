# Recipes list: the filter header (hotfix hf-recipes-filter)

Status: **design, tests red** (2026-11-13). Release: a hotfix on 1.0.0-beta.6. Domain words come from
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
4. **The Tag filter stays single-choice.** Today the Recipes list filters by **one** Tag (`?tag=<name>`, `RecipeFilter.tag:
   string`, and the server's `ListFilter.Tag string`). Several Tags at once would need a server change (repeated `tag`, AND or OR)
   and is out of scope for a hotfix: see [§12](#12-not-in-this-hotfix). The list is a single-select listbox; choosing the
   selected Tag again clears it.
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
| `RecipeFiltersPanel` | features/recipes/components | **New.** The shared `Popover` titled "Filters": a "Course" section (`CourseFilter`, one line) unless `bases`; a "Tag" section (`TagFilterList`); footer "Clear filters" and "Close". |
| `CourseFilter` | features/recipes/components | Unchanged API and copy ("Filter by Course", "All Courses"). Its group is **one line**: it scrolls sideways inside the panel, chips keep their natural width (never crushed). |
| `TagFilterList` | features/recipes/components | **New.** The shared `OptionList` (single) fed by `useTagFilterSearch`: search, rows, empty text. |
| `ActiveFilterChips` | features/recipes/components | **New.** The chip line of row 3: removable chips (`Chip onRemove`) and the "+N" chip, fitted by `useFittingChips`. |
| `TagChips` | features/recipes/components | **Removed** (and its tests): its only caller was this header. |

`RecipesScreen` composes them: `search` slot = row 1, `filters` slot = rows 2 and 3, and the panel.

## 5. States

### 5.1 No filter
Row 1, row 2; no row 3. The button reads "Filters" with no count. In the panel "All Courses" is pressed, no Tag is selected,
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
   end-aligned under the anchor; Escape and an outside click close it and return focus to the anchor; on open, focus moves to the
   first interactive element of the body. Below 768 px it renders a `BottomSheet` with the same title and footer.
2. **`OptionList`** (new, `ui/Select/OptionList.tsx`, exported). An inline, always-open listbox with a search field on top: the
   panel part of `Select` without its trigger. `{ label, searchLabel, query, onQueryChange, options: SelectOption<V>[],
   selected: V[], onToggle(value: V), emptyText?: string | null }`. The search field is a `combobox` (`aria-expanded="true"`,
   `aria-controls`, `aria-activedescendant`); ArrowUp/Down, Home/End move the active option, Enter toggles it; a click toggles.
   It does not filter or order: the caller passes the options to show.
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
- **Panel**: a dialog named "Filters". On open, focus goes to the first Course chip ("All Courses"), or to the Tag search on
  Base recipes. Escape closes it and focus returns to the Filters button. On a phone it is the modal BottomSheet (focus
  trapped; the backdrop and the header's ✕ IconButton dismiss it). The footer "Close" button closes it the same way, on every width.
  On a phone the sheet's ✕ is also named "Close": both buttons do the same thing.
- **Course group**: "Filter by Course", toggle buttons (`aria-pressed`), as today.
- **Tag list**: a search combobox "Search Tags" over a listbox "Filter by Tag"; each option is named by the Tag's name and
  described by its count ("3 Recipes"); `aria-selected` on the chosen Tag. The colour dot is decorative.
- **Chips**: buttons named "Remove Course: Main" and "Remove Tag: fish"; activating one removes the filter and moves focus to the
  next chip, or to the Filters button when it was the last. "+N" is a button named "Show 1 more filter" / "Show 2 more filters"
  that opens the panel.
- **Clear filters**: removes the Course and the Tag, keeps the panel open, focus stays on it (it becomes disabled, so focus
  moves to "Close").
- Kind: radiogroup "Kind" (label visually hidden). Sort: combobox "Sort" (label visually hidden), its value the short label.

## 9. Copy

| Where | Text |
|---|---|
| Search | "Search Recipes" (unchanged) |
| Filters button | "Filters"; accessible name "Filters" / "Filters, 1 active" / "Filters, 2 active"; count chip "1", "2" |
| Panel title | "Filters" |
| Course section heading | "Course"; group name "Filter by Course"; first chip "All Courses" (unchanged) |
| Tag section heading | "Tag" |
| Tag search | label and placeholder "Search Tags" |
| Tag listbox | "Filter by Tag" |
| Tag row meta | "1 Recipe", "3 Recipes", "No Recipes yet" (`tagColourStrings.recipes`) |
| Empty Tag search | "No Tag matches 'xyz'" |
| No Tags | "No Tag to choose from" |
| Panel footer | "Clear filters", "Close" ("Done" is a GLOSSARY _Avoid_ word) |
| Course chip | visible "Main"; name "Remove Course: Main" |
| Tag chip | visible "fish"; name "Remove Tag: fish" |
| More chip | "+1", "+2"; name "Show 1 more filter", "Show 2 more filters" |
| Kind | radiogroup "Kind" (hidden), "Recipes", "Base recipes" (unchanged) |
| Sort | combobox "Sort" (hidden). Trigger: "Name", "Longest ago", "Most recent". Options unchanged: "Name", "Last cooked: longest ago first", "Last cooked: most recent first" |

No word from GLOSSARY's _Avoid_ lists ("category", "label" for a Tag; "dish type" for a Course).

## 10. Colour and type

- New Recipe stays the one accent action of the page. Filters is `secondary`; the count is `Chip kind="count"`; "Close" is
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

- **Several Tags at once.** It needs `?tag=` repeated on `/api/recipes` and the store (`ListFilter.Tag` → `Tags`), and a decision:
  all of them (AND, narrows) or any (OR). The panel's list and chip line are already built for several (`OptionList` takes
  `selected: V[]`, the chip line fits N chips), so it is a server change, a lib change and a `multi` flag.
- Search in the URL (it stays component state, as today).
