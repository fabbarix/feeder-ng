// The page-layout seed, recipe-editor area (B9-10, DS-04): the first seeded Recipe also carries LONG_TAG (36 characters, 338 px as a
// chip), so /recipes/:id/edit shows a selected Tag chip wider than a phone's Tag field (scenario recipe-editor-long-tag).
// seed(ctx) reads step, line, recipeId, LONG_TAG from ctx (the recipes area) and changes the Recipe; it adds nothing to ctx.
// Order 100: right after the base areas, before any later area reads the Recipes.
export const order = 100

export async function seed(ctx) {
  const { step, line, recipeId, LONG_TAG } = ctx
  // The same body the recipes area posted for the first Recipe (index 0: tags quick and family), plus the long Tag.
  await step('recipe with the long Tag', 'PUT', `/api/recipes/${recipeId}`, {
    name: 'Pasta al pomodoro', description: 'A seeded recipe for the layout guard.', yield: 4, readyMeal: false, tags: ['quick', 'family', LONG_TAG],
    lines: [line(0, 200), line(3, 100), line(5, 50)],
    steps: [{ text: 'Prepare everything.', kind: 'active', durationMinutes: 10, leadTimeMinutes: 0, after: [], uses: [] }, { text: 'Cook it.', kind: 'passive', durationMinutes: 20, leadTimeMinutes: 0, after: [0], uses: [] }],
  })
}
