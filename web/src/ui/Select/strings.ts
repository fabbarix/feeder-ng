// English copy for the Select family (kept out of ui/strings.ts, which WP3 edits).
export const selectStrings = {
  searchFor: (entity: string) => `Search ${entity}`,
  noMatch: (entity: string, query: string) => `No ${entity} matches '${query}'`,
  noneToChoose: (entity: string) => `No ${entity} to choose from`,
  createDefault: (query: string) => `Create "${query}"`,
  sort: (label: string) => `Sort: ${label}`,
  createIngredient: (query: string) => `Create Ingredient "${query}"`,
  useUnit: (query: string) => `Use unit "${query}"`,
  baseUnitMeta: (unit: string) => `Base Unit: ${unit}`,
  /** BR-D: the badge of a Base recipe's Ingredient option. */
  baseRecipeBadge: 'Base recipe',
  /** SET-06: the "+N" of the filter line. Its name starts with its visible text ("+3"), so it can be spoken to (WCAG 2.5.3). */
  moreFilters: (n: number) => (n === 1 ? '+1 more filter' : `+${n} more filters`),
  /** SET-06: the same button once the line is expanded. */
  fewerFilters: 'Fewer',
  /** DS-03: the name and title of an icon-only chip: "Sort: Good until". */
  iconOnlyName: (label: string, value: string) => (value ? `${label}: ${value}` : label),
  /** SET-07: TimeZoneSelect. */
  timeZone: 'Time zone',
  timeZoneEntity: 'time zone',
  thisDevice: 'This device',
  otherZones: 'Other',
  /** SET-07: CurrencySelect. */
  currency: 'Currency',
  currencyEntity: 'currency',
  commonCurrencies: 'Common',
  allCurrencies: 'All currencies',
  readyMeal: 'Ready Meal',
}
