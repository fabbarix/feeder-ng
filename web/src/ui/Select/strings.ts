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
}
