// The page-layout seed, recipe-detail area (B9-27, RX-04, RX-05, RX-07): the first seeded Recipe gets a 230-character description, a Source
// (an address and a long attribution), eight Tags (the chip line has to fit them with a "+N") and one Step without a Duration, so
// /recipes/:id has its lede, its Source line, a "+N" chip and a "No time" row (scenarios recipe-detail-cook and recipe-detail-phone).
// Order 110: after recipe-editor (100), which gives the same Recipe its long Tag; this step keeps it (LONG_TAG from ctx).
export const order = 110

export async function seed(ctx) {
  const { step, line, recipeId, LONG_TAG } = ctx
  await step('recipe detail: lede, Source, eight Tags and an untimed Step', 'PUT', `/api/recipes/${recipeId}`, {
    name: 'Pasta al pomodoro',
    description:
      'A quick weeknight tomato sauce with garlic and basil. Make the sauce ahead on Sunday and keep it in the fridge; on the day, boil the pasta and toss everything together with a splash of the cooking water so it turns glossy.',
    yield: 4, readyMeal: false,
    tags: ['quick', 'family', 'vegetarian', 'weeknight', 'batch cooking', 'summer', LONG_TAG, 'freezer friendly'],
    source: { url: 'https://example.test/pasta-al-pomodoro', attribution: 'Nonna Lucia Maria Bernadette' },
    lines: [line(0, 200), line(3, 100), line(5, 50)],
    steps: [
      { text: 'Prepare everything.', kind: 'active', durationMinutes: 10, leadTimeMinutes: 0, after: [], uses: [] },
      { text: 'Cook it.', kind: 'passive', durationMinutes: 20, leadTimeMinutes: 0, after: [0], uses: [] },
      { text: 'Taste and adjust the seasoning.', kind: 'active', durationMinutes: 0, leadTimeMinutes: 0, after: [1], uses: [] },
    ],
  })
}
