// B9-50 (SSP-08; plan section 9 "receipt review"): a Product that matches the fake read's "KITCHEN ROLL 4 PACK" line (the fake Anthropic receipt
// answer, internal/recipeassistant/fakeanthropic/receipt.go, always adds that line as a Not scanned Add named "Kitchen roll"). So the review's Not
// scanned row says "Kitchen roll 4 pack is a Product", and the Add… sheet offers "Is it one of these?" with the Product first
// ("Kitchen roll 4 pack · Product · 4 pieces").
//   - Ingredient "Kitchen roll" (piece) and Product "Kitchen roll 4 pack" (a pack of 4). No Line: the Shopping List's Lines come from the plan.
// Best effort, like every area: a step the API refuses is reported and skipped; the scenario's setup says what is missing.
// seed(ctx) reads step from ctx and adds kitchenRollIngredientId and kitchenRollProductId.

export const order = 500

export async function seed(ctx) {
  const { step } = ctx
  let kitchenRollIngredientId = null
  let kitchenRollProductId = null
  const ing = await step('kitchen roll ingredient', 'POST', '/api/ingredients', { name: 'Kitchen roll', baseUnit: 'piece', shelfLifeDays: 365, conversions: [] })
  if (ing.ok && ing.json?.id) {
    kitchenRollIngredientId = ing.json.id
    const p = await step('kitchen roll product', 'POST', '/api/products', { name: 'Kitchen roll 4 pack', ingredientId: kitchenRollIngredientId, packSize: 4 })
    if (p.ok && p.json?.id) kitchenRollProductId = p.json.id
  }
  Object.assign(ctx, { kitchenRollIngredientId, kitchenRollProductId })
}
