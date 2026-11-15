// B9-45 (PC-02): the words of the Cooked confirmation. Plain TypeScript, no React. STUBS: the developer builds them.

/** "Mon Dinner", or "Mon Dinner, Side" when one Course of several was cooked (`courseName` given). `date` is YYYY-MM-DD. */
export function cookedMealLabel(_date: string, _slotName: string, _courseName?: string | null): string {
  throw new Error('B9-45: not built yet')
}

/** The line under "Cooked, nice one!": "Cauliflower al gorgonzola · Sat Dinner"; without a Recipe name (several Courses cooked together) the meal alone. */
export function cookedLine(_recipeName: string | null, _mealLabel: string): string {
  throw new Error('B9-45: not built yet')
}

/** The Undo button's accessible name: "Undo Cooked for Sat Dinner"; for a Mark all Cooked of several Courses "Undo Cooked for all 3 Courses". */
export function undoCookedName(_mealLabel: string, _courses?: number): string {
  throw new Error('B9-45: not built yet')
}
