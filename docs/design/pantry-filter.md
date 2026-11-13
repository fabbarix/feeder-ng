# Pantry: the filter header (pantry-filter)

Status: **built** (2026-11-13; tests first, then the shared header, then the Pantry). Base: 1.0.0-beta.6.1 (8564c0e6). The Recipes header ([recipes-filter.md](recipes-filter.md),
§1–§15) is the pattern; this page says only what the Pantry does differently and what moved to shared code. Domain words come from
[GLOSSARY.md](../../GLOSSARY.md); the rules from [system.md](system.md) and [ADR 0016](../adr/0016-design-system-rules-enforced.md).

## 1. The problem

The user, after the Recipes header shipped: "Same fix for the pantry, please". Today `/pantry` stacks eight things above the first
Stock Lot: Stock-take and Add to Stock; "By Storage Place / By Ingredient" chips; Search; "All / Use soon / Spoiled" (and "Leftovers")
chips; one chip per Storage Place plus "Not sorted", wrapping onto three lines; "Pantry / Fridge / Freezer" kind chips; a "Sort by" label
over a full-width Select; a "Group by Storage Place" switch; a "Storage Places" settings button. On a phone that is a whole screen of
controls. The labels are inconsistent ("Sort by" is labelled, the chip rows are not) and nothing matches the Recipes header.

## 2. Decisions

1. **The Recipes structure, at every width**: row 1 Search + Filters; row 2 the List control + Sort; row 3 the active filter chips,
   only while a filter is on. Every row is one line.
2. **The filters move into a Filters panel** (popover from 768 px, bottom sheet below, the shared `Popover`): Show (Use soon, Spoiled,
   Leftovers), Kind (Pantry, Fridge, Freezer), Storage Place (a searchable list with Lot counts, Not sorted included) and the "Group by
   Storage Place" switch. Footer: "Clear filters" and "Show Stock".
3. **Use soon and Spoiled are toggle chips with no "All"**: none pressed means all of Stock, the Courses rule (recipes-filter §15).
   They stay one choice (the server flags a Lot as one or the other; "both" would always be empty): pressing the other one moves the
   choice, pressing the pressed one clears it.
4. **Storage Place and Kind stay several-at-once**, as today (`PantryView.places`, `kinds`).
5. **Every filter and the view live in the URL** (§6), each change replacing the history entry, so a link or Back brings them back.
   Today they were component state and were lost on the way back from a Lot.
6. **The device memory stays**: the chosen list (`feeder:pantry-mode`, localStorage) and the open By Ingredient rows
   (`feeder:pantry-open`, sessionStorage) work as before. A `view` in the URL wins over the remembered list; choosing a list writes both.
7. **"Storage Places" goes into a More menu** in the page header (⋮ "More actions", one item "Storage Places" with the settings icon,
   a link to `/settings/storage-places`). Why the menu and not the panel footer:
   - it is navigation, not a filter: a link in a filter panel's footer takes the User off the page half-way through choosing;
   - it is reachable in both lists and without opening the panel (By Ingredient has no Storage Place section);
   - the footer keeps two buttons, which fit one line in a 358 px sheet; a third ("Storage Places" with its icon) would wrap;
   - it is where Recipes keeps its rare actions (Import, Export, Show archived): the same place on both list pages.
8. **Stock-take and Add to Stock stay in the page header**; Add to Stock is the one accent action of the page. Nothing in the header
   rows or the panel is accent (Filters and Show Stock are secondary, Clear filters tertiary).
9. **The L-06 two-column layout stays** (from 1280 px the aside holds the Spoiled tile and the header rows, beside the list). The aside
   gains inline padding for focus rings (§3) and grows from 22.5 to 24 rem: at 22.5 rem row 2 cut "Good until" to "Good u…" (it needs
   191 + 8 + 166 = 365 px), and at 24 rem the shared 24 rem panel, end-aligned to the Filters button at the aside's end, starts at the
   page content's start (P19) with no Pantry width of its own.

## 3. Layout per width

```
 phone 390                                    tablet 834 / 1024                        desktop 1440 / 1920 (L-06)
 ┌────────────────────────────────────────┐   ┌────────────────────────────────────┐   ┌───────────────┬────────────────────┐
 │ Pantry         [Stock-take][+ Add][⋮]  │   │ Pantry      [Stock-take][+ Add][⋮] │   │ Pantry   [Stock-take][+ Add to Stock][⋮]│
 │ (Throw out or keep? tile)              │   │ (tile)                             │   │ (tile)        │ Garage Freezer, 3  │
 │ [🔍 Search Stock      ] [⚲ Filters 2]  │   │ [🔍 Search Stock      ][⚲ Filters 2]│   │ [🔍 …][Filters]│ …                 │
 │ [Storage Place|Ingredient] [↕ Good u…] │   │ [Storage Place|Ingredient]  [↕ Good until]│ [List]  [↕ …] │                    │
 │ (Use soon ×) (Garage Freezer ×) (+1)   │   │ (Use soon ×) (Garage Freezer ×)    │   │ (Use soon ×)… │                    │
 └────────────────────────────────────────┘   └────────────────────────────────────┘   └───────────────┴────────────────────┘
```

- **The rows** use the shared filter-bar classes (§5): `.filter-bar` (a grid, `gap: var(--space-4)`, the ListPage slot gap, so row 3
  sits one slot gap below row 2: P20), `.filter-bar__row.filter-bar__search-row`, `.filter-bar__row.filter-bar__view-row`,
  `.filter-bar__sort`, and the chip line `.filter-chips`.
- **Row 1**: SearchField "Search Stock" takes the free space; Filters keeps its width.
- **Row 2**: the List control (`Segmented compact labelHidden`, radiogroup "List": "Storage Place", "Ingredient") at the start; on
  By Storage Place the Sort chip at the end (`Select appearance="chip" icon="sort"`, combobox "Sort", label hidden). It may shrink, its
  value ending in an ellipsis. By Ingredient has no Sort (its order is fixed: use soon first), so row 2 is the List control alone.
  - **Why "Storage Place · Ingredient" and not "By Storage Place · By Ingredient"** (the labels of beta.6): measured on the real build at
    390 px, "By Storage Place | By Ingredient" is 228 px, which leaves the Sort chip 122 px of the 166 it needs: it showed "G…". Without
    "By" the control is 191 px: the chip gets 159 px at 390 and 129 px at 360. The radiogroup is still named "List".
  - **Below 420 px the Sort chip has no leading sort icon**, on both headers (the user's decision in review): the icon and its gap are
    40 px, so "Good until" needs 126 px and shows in full from 360 px (it read "Good u…" from 360 to 397 px with the icon). It mends
    Recipes too: in beta.6.1 its "Longest ago" and "Most recent" were cut below about 388 px ("Longest a…" in 58 of 85 px at 360);
    without the icon they fit at 360. From 420 px the icon is back and "Good until" fits with it (365 of 388 px). The guard's P22 fails
    any chip Select whose value is cut, and reads it on each width of the 360 to 480 px walk (§10).
- **Row 3**: `ActiveFilterChips` (shared), the chips that fit, then "+N" which opens the panel. Natural widths are measured in the
  inert copy and the fit has hysteresis (`fitChips`, `FIT_MARGIN`), exactly as Recipes.
- **The aside from 1280 px** keeps its sticky, scrolling column. It scrolls, so it clips: it is padded by `--space-2` inline (with a
  matching negative margin, so its content still starts at the column's edge) and `--space-3` at its end, so a chip's focus ring
  (5 px) and a removable chip's hit area (9 px below it) are never cut (P18).
- **The panel**: `.filter-panel.pantry-filters__panel`, the shared `inline-size: min(24rem, 100vw - 2 * var(--space-4))`; the Storage
  Place list scrolls inside `max-block-size: min(16rem, 40dvh)` so the popover fits a 900 px high desktop.

| Width | Row 1 | Row 2 | Panel |
|---|---|---|---|
| 390 | Search + Filters | List (191 px) + Sort chip (no icon below 420 px, "Good until" in full) | Bottom sheet |
| 834, 1024 | Search + Filters | List … Sort | Popover under Filters, end-aligned |
| 1440, 1920 | in the 24 rem aside | in the aside, "Good until" in full | Popover, 24 rem, from the content start to the button's end |

## 4. States

### 4.1 No filter
Rows 1 and 2; no row 3. "Filters" has no count. In the panel nothing is pressed or selected; Clear filters is disabled.

### 4.2 Some filters
"Filters" and a count chip (one per active chip). Row 3 shows, in this order: the status chip ("Use soon", `status="spoil"`; "Spoiled",
`status="danger"`, each with its status icon, the status colours of system.md §2), "Leftovers" (`status="leftover"`, teal), one chip
per Kind ("Fridge", with its kind icon), one per Storage Place (by name, "Not sorted" last; neutral). Each is a removable chip.

### 4.3 By Ingredient
Only the status filter applies (the per-Ingredient totals have no Storage Place). A Storage Place, Kind or Leftovers filter in the URL is
kept but not applied, not counted, not shown as a chip, and its sections are not in the panel (the Recipes rule for a Course on Base
recipes). The panel holds Show (Use soon, Spoiled) only.

### 4.4 Many Storage Places
Nothing changes in the header. The panel's Storage Place list scrolls inside its own box under its search. Each row:
`[kind icon] Garage Freezer ........ 3 Stock Lots`; "Not sorted" last, with the `location` icon (there is no kind to show). Rows keep the name order whether
selected or not (several can be selected; a row that jumps away on a tap is lost).

### 4.5 The chip line overflows
As recipes-filter §5.4: only the first chip may be cut; the rest go into "+N". The guard's scenario (Use soon + a 60-character Storage
Place) shows "Use soon ×" and "+1" at 390 px.

### 4.6 Empty Storage Place search
"No Storage Place matches 'xyz'" in place of the rows. A Household with no Storage Places has no Kind and no Storage Place
section: every Lot is Not sorted, so neither would filter anything (Storage Places are added from the More menu).

### 4.7 A Storage Place in the URL that no longer exists
`place=<id>` that is not one of the Household's Storage Places (deleted, or still loading) is ignored: not applied, not counted, no
chip. `place=none` (Not sorted) always applies. An unknown `status`, `kind`, `sort` or `view` value is ignored.

### 4.8 Leftovers
The "Leftovers" chip in the panel shows only while the Pantry holds frozen Leftovers (as today). `leftovers=1` in the URL applies on By
Storage Place whether or not there are any (the list is then "Nothing in Stock matches"), and its chip lets the User remove it.

## 5. Shared pieces (moved out of Recipes)

| Piece | From | To |
|---|---|---|
| `fitChips`, `FIT_MARGIN` | `features/recipes/lib/recipeFilters.ts` | `lib/filters/fitChips.ts` (plain TS) |
| `useFittingChips`, `measureChipLine`, `ChipLineMetrics` | `features/recipes/hooks/useFittingChips.ts` | `ui/FilterBar/useFittingChips.ts` |
| `ActiveFilterChips` (generic over the chip key) | `features/recipes/components/ActiveFilterChips.tsx` | `ui/FilterBar/ActiveFilterChips.tsx` |
| `FiltersButton` (was `RecipeFiltersButton`) | `features/recipes/components/RecipeFiltersButton.tsx` | `ui/FilterBar/FiltersButton.tsx` |
| `FiltersPanel` (Popover + spaced body + Clear filters / Show …) | the frame of `RecipeFiltersPanel` | `ui/FilterBar/FiltersPanel.tsx` |
| `FilterSection` (a section with a `label` heading) | the sections of `RecipeFiltersPanel` | `ui/FilterBar/FilterSection.tsx` |
| `FilterChipGroup` (one line of toggle filter chips that scrolls sideways) | new | `ui/FilterBar/FilterChipGroup.tsx` |
| `OptionList` `multiple` (the listbox says `aria-multiselectable`) | new | `ui/Select/OptionList.tsx` |
| `FilterChip` (the chip descriptor: key, label, removeLabel, tagColour?, status?, icon?) | `ActiveFilterChip` | `ui/FilterBar/types.ts` |
| Copy: "Filters", "Filters, 2 active", "Active filters", "Show 1 more filter", "Clear filters" | `recipeStrings.filters` | `ui/FilterBar/strings.ts` (`recipeStrings.filters` points at them) |
| CSS: rows, chip line, measuring copy, panel width, body, sections, headings, capped list | `recipes.css` (`.recipe-filters__*`) | `ui/FilterBar/FilterBar.css` (`.filter-bar*`, `.filter-chips*`, `.filter-panel*`, `.filter-chip-group`) |

Recipes keeps what is its own: `RecipeKindControl`, `RecipeSortSelect`, `CourseFilter`, `TagFilterList`, `RecipeFiltersPanel` (now a
`FiltersPanel` with a Course and a Tag `FilterSection`), `useRecipeFilters` and `.recipes-screen .list-page__filters`. Its behaviour, DOM
order, names and copy are unchanged; only class names change (`recipe-filters__chips` → `filter-chips`, and so on).

## 6. Libraries and hooks (the pinned API)

`features/stock/lib/pantryFilters.ts`, plain TypeScript:

```ts
export type PantryMode = 'places' | 'ingredients'
export interface PantryFilterState {
  mode: PantryMode | null          // ?view=places|ingredients; null when absent or unknown (the remembered list applies)
  status: StockFilter              // ?status=useSoon|spoiled; 'all' when absent or unknown
  places: number[]                 // ?place=<id>&place=none (UNSORTED = 0); positive whole ids, no repeats, in URL order
  kinds: StorageKind[]             // ?kind=pantry|fridge|freezer, no repeats
  leftovers: boolean               // ?leftovers=1
  sort: PantrySort                 // ?sort=…; 'goodUntil' when absent or unknown
  groupByPlace: boolean            // ?group=off → false
}
export function pantryFiltersFromParams(params: URLSearchParams): PantryFilterState
export function withMode(params, mode: PantryMode): URLSearchParams
export function withStatus(params, status: StockFilter): URLSearchParams      // 'all' deletes
export function withPlaceToggled(params, id: number): URLSearchParams
export function withKindToggled(params, kind: StorageKind): URLSearchParams
export function withLeftovers(params, on: boolean): URLSearchParams
export function withSort(params, sort: PantrySort): URLSearchParams            // 'goodUntil' deletes
export function withGroupByPlace(params, on: boolean): URLSearchParams         // true deletes
export function withoutPantryFilters(params): URLSearchParams                  // deletes status, place, kind, leftovers
export type PantryChipKey = 'status' | 'leftovers' | `kind:${StorageKind}` | `place:${number}`
export function withoutChip(params, key: PantryChipKey): URLSearchParams
export interface AppliedPantryFilters { status: StockFilter; places: number[]; kinds: StorageKind[]; onlyLeftovers: boolean }
export function appliedFilters(state, mode: PantryMode, places: readonly StoragePlace[]): AppliedPantryFilters
export function pantryFilterChips(state, mode: PantryMode, places: readonly StoragePlace[]): FilterChip<PantryChipKey>[]
export interface PlaceFilterRow { id: number; name: string; kind: StorageKind | null; lots: number; selected: boolean }
export function placeFilterRows(places, lots: readonly StockLot[], selected: readonly number[], query: string): PlaceFilterRow[]
```

- `appliedFilters`: on By Ingredient only `status`; on By Storage Place the known place ids (and UNSORTED), the kinds, Leftovers.
- `pantryFilterChips`: the order of §4.2; counts = chips; place chips by name, Not sorted last; `removeLabel` "Remove Use soon",
  "Remove Leftovers", "Remove kind: Fridge", "Remove Storage Place: Garage Freezer".
- `placeFilterRows`: every Storage Place by name (accent- and case-blind, numeric), then Not sorted; `lots` counts the Lots in it (a
  Lot in a deleted place counts as Not sorted); the query matches accent- and case-blind, every word.
- `withPlaceToggled` / `withKindToggled` keep the other values and their order; `withoutPantryFilters` keeps `view`, `sort`, `group`.

Hooks:

```ts
// hooks/usePantryFilters.ts (inside a router)
export const PANTRY_MODE_KEY = 'feeder:pantry-mode'
export interface UsePantryFilters {
  mode: PantryMode; setMode(mode: PantryMode): void          // URL view, else the device's, else 'places'; writes both
  status: StockFilter; setStatus(status: StockFilter): void  // choosing the status in force again clears it
  places: number[]; togglePlace(id: number): void
  kinds: StorageKind[]; toggleKind(kind: StorageKind): void
  leftovers: boolean; setLeftovers(on: boolean): void
  sort: PantrySort; setSort(sort: PantrySort): void
  groupByPlace: boolean; setGroupByPlace(on: boolean): void
  applied: AppliedPantryFilters
  chips: FilterChip<PantryChipKey>[]; count: number
  remove(key: PantryChipKey): void; clear(): void
}
export function usePantryFilters(places: readonly StoragePlace[]): UsePantryFilters

// hooks/usePlaceFilterSearch.ts
export function usePlaceFilterSearch(places, lots, selected): { query; setQuery; rows: PlaceFilterRow[]; emptyText: string | null }

// hooks/usePantry.ts: the view comes in (the URL's filters and the screen's search), no state of its own
export function usePantry(input: { filters: Pick<UsePantryFilters, 'mode' | 'applied' | 'sort' | 'groupByPlace'>; query: string }): UsePantry
```

Every setter writes with `{ replace: true }` and keeps the other parameters. The search stays component state (as Recipes).

## 7. Components (`features/stock/components`)

| Component | What it is |
|---|---|
| `PantryModeControl` | `Segmented compact labelHidden`, radiogroup "List": Storage Place, Ingredient. |
| `PantrySortSelect` | `Select appearance="chip" icon="sort"` (the icon hidden below 420 px, shared CSS), combobox "Sort"; trigger "Good until", "Name", "Quantity", "Bought", "Storage Place". |
| `PantryFiltersPanel` | `FiltersPanel` titled "Filters", "Show Stock": Show (`FilterChipGroup`), Kind (`FilterChipGroup`, with icons), Storage Place (`PlaceFilterList`), the "Group by Storage Place" `Switch`; the last three on By Storage Place only, Kind and Storage Place only when the Household has Storage Places. |
| `PlaceFilterList` | The shared `OptionList` (several) fed by `usePlaceFilterSearch`, each row led by its kind icon. |
| `PantryOverflowMenu` | The shared `Menu` "More actions" with "Storage Places". |
| `PantryFilters` | **Removed**: its only caller was this header. |

`StockScreen` composes them; it holds the search text, the panel's open state and nothing else of the filters.

## 8. Keyboard and screen reader

As recipes-filter §8, with these names:

- Tab order: Search → Filters → List (one stop) → Sort → each chip → "+N" → the list.
- Filters: "Filters" / "Filters, 2 active", `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`.
- Panel: dialog "Filters"; on open, focus goes to "Use soon". Escape and "Show Stock" close it, focus back on Filters.
- Show: group "Show" of toggle buttons (`aria-pressed`): "Use soon", "Spoiled", "Leftovers".
- Kind: group "Filter by kind": "Pantry", "Fridge", "Freezer".
- Storage Place: combobox "Search Storage Places" over the multi-select listbox "Filter by Storage Place"; each option named by the
  place, described by its count ("3 Stock Lots"); `aria-selected` on each chosen place. The kind icon is decorative.
- Group by Storage Place: switch.
- Chips: "Remove Use soon", "Remove Spoiled", "Remove Leftovers", "Remove kind: Fridge", "Remove Storage Place: Garage Freezer";
  removing one moves focus to the next chip, or to Filters. "+N": "Show 1 more filter".
- List: radiogroup "List" (label hidden). Sort: combobox "Sort" (label hidden).
- More: the "More actions" menu button; its item "Storage Places" is a link.

## 9. Copy

| Where | Text |
|---|---|
| Search | "Search Stock" (unchanged) |
| Filters button, count, chip line, "+N", Clear filters | the shared filter-bar copy (as Recipes) |
| Panel title / footer | "Filters" / "Clear filters", "Show Stock" ("Done" is a GLOSSARY _Avoid_ word; "Close" is the sheet's ✕) |
| Show section | heading "Show"; "Use soon", "Spoiled", "Leftovers" (no "All") |
| Kind section | heading "Kind"; group "Filter by kind"; "Pantry", "Fridge", "Freezer" |
| Storage Place section | heading "Storage Place"; search "Search Storage Places"; listbox "Filter by Storage Place"; meta "1 Stock Lot", "3 Stock Lots", "No Stock Lots"; empty "No Storage Place matches 'xyz'" |
| Switch | "Group by Storage Place" (unchanged) |
| List | radiogroup "List" (hidden): "Storage Place", "Ingredient" ("By" dropped, §3) |
| Sort | combobox "Sort" (hidden). Trigger "Good until", "Name", "Quantity", "Bought", "Storage Place"; options "Good until", "Name", "Quantity", "Bought (newest)", "Storage Place" |
| More menu | "More actions" → "Storage Places" |

Stock, Stock Lot, Storage Place, Use soon, Spoiled, Good until and Leftover as GLOSSARY spells them; never "inventory", "location",
"expiry", "batch" or "item".

## 10. Tests

| Kind | Files |
|---|---|
| Library | `stock/lib/pantryFilters.test.ts`, `lib/filters/fitChips.test.ts` (moved from `recipeFilters.fit.test.ts`) |
| Hooks | `stock/hooks/usePantryFilters.test.tsx`, `stock/hooks/usePlaceFilterSearch.test.tsx`, `ui/FilterBar/useFittingChips{,.stability}.test.tsx` (moved) |
| Components | `stock/components/PantryFiltersPanel.test.tsx`, `PlaceFilterList.test.tsx`, `PantryHeaderControls.test.tsx` (List, Sort, More); `ui/FilterBar/{ActiveFilterChips,FiltersButton,FiltersPanel,FilterChipGroup}.test.tsx` (the first two moved from Recipes); `ui/Select/OptionList.test.tsx` (`multiple`) |
| Screen | `stock/screens/StockScreen.filters.test.tsx` (structure, panel, chips, URL round trip, Back, device memory) and the updated Pantry screen tests |
| a11y | `stock/screens/StockScreen.filters.a11y.test.tsx` |
| CSS contract | `ui/FilterBar/FilterBar.css.test.ts`, `stock/pantry.filters.css.test.ts` |
| Guard | `app/pageLayoutRules.pantryFilter.test.ts`: SCENARIOS `pantry-filtered` and `pantry-filtered-open`; a second walk (`RESIZE_WALKS`); probes on the shared classes; the seed's 10 Storage Places (one of 60 characters, the API's limit), Lots in them, a use-soon Lot; `longPlaceId` in the ids file |

## 11. Not in this change

- **"Use soon" and "Spoiled" together** (OR). It would need the status as a list in the URL and the lib; nobody asked.
- **Sort for By Ingredient.** Its fixed order (use soon first, then name) stays.
- **CourseFilter on the shared `FilterChipGroup`.** Same look and CSS; moving it changes Recipes' class names and tests for no gain now.
- **A guard rule for a cut Select chip value.** P16 only sees `.chip` labels under 24 px; "G…" in a Select chip passed the guard.
