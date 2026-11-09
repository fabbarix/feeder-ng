/** Total number of places (across features) that use an Ingredient, from a label -> count map. */
export function totalReferences(refs: Readonly<Record<string, number>>): number {
  return Object.values(refs).reduce((sum, n) => sum + n, 0)
}
