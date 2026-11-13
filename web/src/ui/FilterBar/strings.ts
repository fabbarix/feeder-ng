// The copy of the shared filter header (docs/design/recipes-filter.md 9, docs/design/pantry-filter.md 9). Feature strings point at
// these, so the Recipes and the Pantry headers say the same words.
export const filterBarStrings = {
  button: 'Filters',
  panelTitle: 'Filters',
  clear: 'Clear filters',
  activeLabel: 'Active filters',
  moreLabel: (n: number) => (n === 1 ? 'Show 1 more filter' : `Show ${n} more filters`),
  buttonLabel: (count: number) => (count === 0 ? 'Filters' : `Filters, ${count} active`),
}
