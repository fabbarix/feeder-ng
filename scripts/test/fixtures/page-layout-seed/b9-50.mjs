// B9-50 (SSP-08; plan section 9 "receipt review"): a Product that matches the fake read's "KITCHEN ROLL 4 PACK" line (the fake Anthropic receipt
// answer, internal/recipeassistant/fakeanthropic/receipt.go, always adds that line as a Not scanned Add named "Kitchen roll"). So the review's Not
// scanned row says "Kitchen roll 4 pack is a Product", and the Add… sheet offers "Is it one of these?" with the Product first
// ("Kitchen roll 4 pack · Product · 4 pieces").
//   - Product "Kitchen roll 4 pack" (a pack of 4) of "Kitchen roll": the supplies area's Supply and Product when they are there, else made
//     here. No Line: the Shopping List's Lines come from the plan.
// Best effort, like every area: a step the API refuses is reported and skipped; the scenario's setup says what is missing.
// seed(ctx) reads step from ctx and adds kitchenRollIngredientId and kitchenRollProductId.

export const order = 500

export async function seed(ctx) {
  const { step } = ctx
  let kitchenRollIngredientId = null
  let kitchenRollProductId = null
  // The supplies area already makes the Supply "Kitchen roll" with its Product "Kitchen roll 4 pack" (a pack of 4): use it when it is there,
  // so this area never fails on a name that is taken; otherwise make the pair here.
  const found = await step('kitchen roll product lookup', 'GET', '/api/products?q=Kitchen%20roll')
  const existing = Array.isArray(found.json) ? found.json.find((p) => p.name === 'Kitchen roll 4 pack' && !p.archived) : undefined
  if (existing) {
    kitchenRollIngredientId = existing.ingredientId
    kitchenRollProductId = existing.id
  } else {
    const ing = await step('kitchen roll ingredient', 'POST', '/api/ingredients', { name: 'Kitchen roll', baseUnit: 'piece', shelfLifeDays: 365, conversions: [] })
    if (ing.ok && ing.json?.id) {
      kitchenRollIngredientId = ing.json.id
      const p = await step('kitchen roll product', 'POST', '/api/products', { name: 'Kitchen roll 4 pack', ingredientId: kitchenRollIngredientId, packSize: 4 })
      if (p.ok && p.json?.id) kitchenRollProductId = p.json.id
    }
  }
  Object.assign(ctx, { kitchenRollIngredientId, kitchenRollProductId })
}
