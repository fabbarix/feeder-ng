// B9-26 (plan section 9, seed changes): a Dessert Course on every Dinner, so a Dinner has three Courses ("Undo Cooked for all 3 Courses",
// What changed with several Courses). Best effort like the base areas: a step the API refuses is reported and skipped.
// seed(ctx) reads api, step, line from ctx; adds dessertCourse.
export const order = 120

export async function seed(ctx) {
  const { api, step, line } = ctx
  const listOf = (r) => (Array.isArray(r.json) ? r.json : (Object.values(r.json ?? {}).find(Array.isArray) ?? []))
  await api('POST', '/api/courses', { name: 'Dessert' }) // 409 when it exists already
  const courses = listOf(await api('GET', '/api/courses'))
  const dessert = courses.find((c) => c.name === 'Dessert')
  const dinnerCourses = ['Main', 'Side', 'Dessert'].map((n) => courses.find((c) => c.name === n)).filter(Boolean)
  if (!dessert || dinnerCourses.length < 3) return
  const cook = [{ text: 'Prepare and cook.', kind: 'active', durationMinutes: 15, leadTimeMinutes: 0, after: [], uses: [] }]
  await step('dessert recipe', 'POST', '/api/recipes', {
    name: 'Rice pudding with cinnamon and baked plums', description: '', yield: 4, readyMeal: false, tags: ['vegetarian'], courseIds: [dessert.id], lines: [line(3, 200)], steps: cook,
  })
  for (const slot of listOf(await api('GET', '/api/meal-slots')).filter((x) => x.name === 'Dinner')) {
    const { id, ...body } = slot
    await step('dinner desserts', 'PATCH', `/api/meal-slots/${id}`, { ...body, courses: dinnerCourses.map((c) => ({ id: c.id, optional: false, optOutMemberIds: [] })) })
  }
  await step('plan', 'POST', '/api/plan/regenerate', {})
  Object.assign(ctx, { dessertCourse: dessert })
}
