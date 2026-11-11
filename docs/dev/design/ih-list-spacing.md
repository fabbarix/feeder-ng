# IH: list screens separate the header, search and list

Report: on /ingredients the h1 and "New Ingredient" button sit directly on the Search field, which sits directly on the list card. Header, search and list read as one lump.

## Findings

Every list screen composes `PageHeader` + (`SearchField`) + a `ListGroup`, but each wraps them in its own ad-hoc root:

| Screen | Root today | Gap today |
|---|---|---|
| Ingredients | bare `<section>` | none (the bug) |
| Products | `div.pg` (products.css) | `16px` literal |
| Shops (settings) | `div.pg` | `16px` literal |
| Storage places | `div.pg` | `16px` literal |
| Recipes | `section.recipes-screen` | `--space-4` |
| Stock | `div.stock-screen` (two columns from 1280 px, search lives in the aside) | `--space-4` |

Ingredients was simply missed; the others only avoid the bug by copying a gap. Shared `Page` has no vertical rhythm of its own (it is only the width container).

## Decision

New shared primitive `ListPage` (`web/src/ui/ListPage.tsx` + `ListPage.css`), slots `header`, `search`, `filters`, children (the list or its empty/error state):

```
div.list-page            display: grid; gap: var(--space-4); align-content: start; min-inline-size: 0
  div.list-page__header   (PageHeader)
  div.list-page__search   (SearchField)      only when given
  div.list-page__filters  (chips, TagChips)  only when given
  div.list-page__list     display: grid; gap: var(--space-4); align-content: start
                          (ListGroup / EmptyState / status, plus the intro and add action when they sit with the list)
```

One token gap, `--space-4` (16 px), between the header row, search, filters and list; the search therefore never touches the list card. The list slot stacks its own children with the same gap, so the Storage Places intro, list and "Add Storage Place" button no longer sit flush. No new tokens, no px literals.

Screens migrated: Ingredients, Products, Shops, Storage places, Recipes. They drop their ad-hoc root (`.pg`, bare `<section>`, `.recipes-screen` as a layout root). Stock keeps its two-column layout (search is in the aside, already `--space-4`).

Recipes: `recipes.css` no longer lists `.recipes-screen` in the flex-column rule. `ListPage`'s grid owns the Recipes layout. The `recipes-screen` class stays on the `ListPage` root only as the scope for the 3/4-column Bento rules. `.recipe-detail` and `.recipe-editor` keep their own flex column.

Exports: `ListPage` and `ListPageProps` are exported from `web/src/ui/index.ts`, and the Gallery has a `ListPage` section in both schemes (`web/src/ui/Gallery.tsx`).

## Tests (red first)

- `ui/ListPage.css.test.ts`: grid, token gap, no px/colour literals.
- `ui/ListPage.test.tsx`: slot order header, search, filters, list; absent slots render nothing.
- `features/listScreens.layout.test.ts`: the five screens use `<ListPage` and no longer use `className="pg"` or a bare `<section>` as their root; Recipes keeps `recipes-screen` on the `ListPage` root for the Bento rules; `.stock-screen` gap is a token.
- `features/stock/screens/StoragePlacesScreen.test.tsx`: the intro, the list and the add action sit in the gapped `.list-page__list` slot.
- `ui/Gallery.test.tsx`: the Gallery lists the `ListPage` section.

The page-layout guard (P1..P9: overflow, centring, widths, field sizes, sticky bars, contrast) has no vertical-spacing rule, so no guard expectation is added; the structure tests carry it.
