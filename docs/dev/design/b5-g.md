# b5-g: Settings grouped, and the nav that follows

Source: spec decisions 43 and 44, `beta5-plan.md` 2.8, `beta5-reconcile.md` 8 and 12 (WP G). Routes do not change, so `ROUTE_WIDTHS`
(`/ingredients`, `/products` are already narrow) and `scripts/lib/page-layout-rules.mjs` need no edit.

## Index (`settingsSections.ts`)

Three groups, in order; the `admin` group goes (its type literal too). Rows keep their ids; `ingredients` and `products` are new.

| Group (caption) | Rows, in order | Who |
|---|---|---|
| `catalogue` "Catalogue" | Ingredients `/ingredients` (icon `ingredients`), Products `/products` (icon `barcodes`), Shops, Tags, Courses, Storage Places | every User |
| `household` "Household" | Household, Members, Meal Slots, Planning rules, Sign-in requests | every User |
| | Allowlist, Recipe Assistant | Admins only, last rows of Household |
| `you` "You" | Your preferences, Notifications | every User |

Copy (strings.ts, `index.groups` gains `catalogue: 'Catalogue'`, loses `admin`): Ingredients "What you cook with, and what it means" and
Products "What you buy: brands and pack sizes" are proposals for the developer to adjust (non-empty, one line, no `_Avoid_` word).
`SettingsIndexPage` renders `settingsGroups(isAdmin)` unchanged; only the data changes. The Sign-in requests row keeps its badge.

## Nav

- `features/{ingredients,products,shops}/index.ts`: `navItems` removed (the stale Shops item with them). `MENU_ICONS` in `app/nav.ts` emptied
  (`menuIconFor` keeps the own-icon-else-chevron rule). `MENU_NAV` stays Kitchen board; Sign out and Sign-in requests are drawn by `YourMenu` (NAV's).
- Breadcrumbs: `/ingredients` and `/products` become table entries with parent `/settings` (label from `settingsStrings.index.sections`);
  `/ingredients/:id`, `/products/:id` keep their parents. Trails: Settings > Ingredients > Garlic. The two list screens render the trail
  (`useBreadcrumbs` + `PageHeader breadcrumbs`) like Settings pages do. `ROOTS` loses ingredients and products.

## Tests (red now)

`settingsSections.test.ts`, `SettingsIndexPage*.test.tsx`, `nav.test.ts`, `features/ingredients/index.test.ts`, `app/breadcrumbs.test.ts`,
`app/catalogueNav.test.tsx` (new: real feature nav items, crumbs, the two screens' trails), `settingsBreadcrumbs.test.tsx` (routes added).

## Open

`IngredientsScreen.tsx` and `ProductsScreen.tsx` are outside G's file row but must render the trail; the PM must grant them to the developer
(or to the owner of `features/ingredients` and `features/products`). `features/shops/index.ts` and `products/index.ts` have no index test; the
new `catalogueNav.test.tsx` covers their nav items.
