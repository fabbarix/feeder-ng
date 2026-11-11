// English copy for the Tag primitives.
export const tagColourStrings = {
  /** Meta line of a Tag option: "12 Recipes", "1 Recipe", "No Recipes yet". */
  recipes: (n: number): string => {
    if (n === 0) return 'No Recipes yet'
    return n === 1 ? '1 Recipe' : `${n} Recipes`
  },
}
