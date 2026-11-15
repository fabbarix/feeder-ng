// B9-48 (SAFE-02; batch w3e): an Ingredient that nothing uses, so the guard's ingredient-delete-confirm scenario can open Delete
// Ingredient's confirm (Delete is disabled on the seeded ingredientId, Flour, which Recipes use). The scenario finds it by name.
// seed(ctx) reads api, step from ctx; adds unusedIngredient.
export const order = 480
export const UNUSED_INGREDIENT = 'Star anise'

export async function seed(ctx) {
  const { step } = ctx
  const r = await step('unused ingredient', 'POST', '/api/ingredients', { name: UNUSED_INGREDIENT.toLowerCase(), baseUnit: 'g', shelfLifeDays: 365, conversions: [] })
  Object.assign(ctx, { unusedIngredient: r.ok ? r.json : null })
}
