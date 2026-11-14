// The page-layout seed, recipes area (B9-03: scripts/test/fixtures/page-layout-seed.mjs split by area; the calls are unchanged).
// 25 Ingredients, 10 Recipes (one very long name, a Ready Meal), many Tags and LONG_TAG (the filtered /recipes scenarios).
// seed(ctx) reads step from ctx and adds ing, ingredientId, line, recipeId, LONG_TAG.

// The one very long Tag (40 characters at most; see the hf-recipes-filter notes in seed()): the filtered /recipes scenarios filter by it.
export const LONG_TAG = 'HEARTY HOMEMADE MUSHROOM WELLINGTONS'

export async function seed(ctx) {
  const { step } = ctx
  // Ingredients
  const NAMES = ['Flour', 'Rice', 'Pasta', 'Tomato', 'Onion', 'Garlic', 'Olive oil', 'Butter', 'Milk', 'Eggs', 'Chicken', 'Lentils', 'Carrot',
    'Potato', 'Cheese', 'Basil', 'Salt', 'Sugar', 'Lemon', 'Beans', 'Spinach', 'Cream', 'Mushroom', 'Pepper', 'Yoghurt']
  const BASE = { Milk: 'ml', 'Olive oil': 'ml', Cream: 'ml', Eggs: 'piece', Onion: 'piece', Lemon: 'piece' }
  const ing = []
  for (const [i, name] of NAMES.entries()) {
    const r = await step('ingredient', 'POST', '/api/ingredients', {
      name, baseUnit: BASE[name] ?? 'g', shelfLifeDays: i % 3 === 0 ? 7 : null, conversions: [],
    })
    if (r.ok && r.json) ing.push(r.json)
  }
  const ingredientId = ing[0]?.id ?? 1

  // Recipes (8 with several lines, one very long name, one Ready Meal)
  const line = (i, n) => ({ ingredientId: ing[i % ing.length]?.id ?? 1, quantity: n, unit: ing[i % ing.length]?.baseUnit ?? 'g', optional: false, note: '' })
  const RECIPES = ['Pasta al pomodoro', 'Lentil soup', 'Chicken curry', 'Risotto ai funghi', 'Spinach omelette', 'Potato gratin', 'Bean chilli',
    'Roast chicken with lemon, garlic and thyme, a very long name that wraps over lines', 'Pancakes', 'Frozen lasagne']
  let recipeId = 1
  for (const [i, name] of RECIPES.entries()) {
    const ready = name === 'Frozen lasagne'
    const r = await step('recipe', 'POST', '/api/recipes', {
      name, description: 'A seeded recipe for the layout guard.', yield: 4, readyMeal: ready, tags: i % 2 ? ['easy'] : ['quick', 'family'],
      lines: ready ? [line(14, 400)] : [line(i, 200), line(i + 3, 100), line(i + 5, 50)],
      steps: ready ? [] : [{ text: 'Prepare everything.', kind: 'active', durationMinutes: 10, leadTimeMinutes: 0, after: [], uses: [] }, { text: 'Cook it.', kind: 'passive', durationMinutes: 20, leadTimeMinutes: 0, after: [0], uses: [] }],
    })
    if (r.ok && r.json?.id && i === 0) recipeId = r.json.id
  }

  // hf-recipes-filter: many Tags (docs/design/recipes-filter.md), so /recipes shows its filter header as a household with dozens of
  // Tags sees it (the beta.6 Tag row crushed every chip to its dot). A Tag may exist with no Recipe (GLOSSARY); one Recipe carries
  // eight of them, with long names, so its tile's Tag line is exercised too.
  // Round 2: one very long Tag; with the Side Course it makes the active filter chips overflow into "+1" at 390 and 430 px.
  // Round 3: a Tag holds at most 40 characters (the API refuses longer ones, so the 51-character Tag of round 2 was never created). In
  // capitals this 36-character name draws a 338 px chip (with its colour dot and close icon). Beside "Side" (72 px and an 8 px gap) the
  // line needs 418 px: it overflows into "+1" below a 450 px screen (390 and 430 included) and both chips show again from 462 px (the
  // FIT_MARGIN), so the guard's 360-480 px walk and live sweep cross both edges of the fit.
  const MANY_TAGS = ['beef', 'breakfast', 'budget', 'chicken', 'comfort food', 'curry', 'dairy-free', 'fish', 'freezer', 'gluten-free',
    'grill', 'kids', 'leftovers', 'lunchbox', 'one-pot', 'pasta', 'pork', 'rice', 'roast', 'salad', 'slow cooker', 'soup', 'spicy',
    'sweet', 'vegan', 'weeknight', 'batch cooking', 'high protein']
  for (const name of MANY_TAGS) await step('tag', 'POST', '/api/tags', { name, colour: '' })
  await step('many-tag recipe', 'POST', '/api/recipes', {
    name: 'Slow cooker beef and barley stew', description: '', yield: 6, readyMeal: false,
    tags: ['slow cooker', 'beef', 'comfort food', 'batch cooking', 'freezer', 'high protein', 'weeknight', 'one-pot'],
    lines: [line(10, 600), line(13, 300), line(4, 2)], steps: [{ text: 'Cook it slowly.', kind: 'passive', durationMinutes: 360, leadTimeMinutes: 0, after: [], uses: [] }],
  })
  Object.assign(ctx, { ing, ingredientId, line, recipeId, LONG_TAG })
}
