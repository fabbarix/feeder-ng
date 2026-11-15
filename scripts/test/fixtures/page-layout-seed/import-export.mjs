// The page-layout seed, import-export area (B9-28, RX-01): one Recipe the import guard's file also holds, so its review shows a Recipe that
// already exists (the row with Replace, Keep both and Skip). The file itself is in scripts/lib/page-layout/scenarios/import.mjs.
// seed(ctx) reads step, ing and line from ctx (the recipes area) and adds nothing to ctx.
// Order 110: after the base areas and the recipe-editor area.
export const order = 110

export async function seed(ctx) {
  const { step, line } = ctx
  await step('recipe the import guard file also holds', 'POST', '/api/recipes', {
    name: 'Import guard stew', description: 'A seeded recipe the import guard file also holds.', yield: 4, readyMeal: false, tags: [],
    lines: [line(1, 300)],
    steps: [{ text: 'Simmer it.', kind: 'passive', durationMinutes: 30, leadTimeMinutes: 0, after: [], uses: [] }],
  })
}
