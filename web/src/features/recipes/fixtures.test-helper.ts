// Builders shared by the WP9 tests of this feature.
import type { CourseChoice } from '../../lib/courses'
import type { IngredientRef, Recipe, RecipeSummary } from './types'

export const garlic: IngredientRef = { id: 7, name: 'garlic', baseUnit: 'g', conversions: [{ unit: 'clove', toBase: 5 }] }
export const flour: IngredientRef = { id: 8, name: 'flour', baseUnit: 'g', conversions: [] }
export const milk: IngredientRef = { id: 9, name: 'milk', baseUnit: 'ml', conversions: [] }

export function summary(over: Partial<RecipeSummary> = {}): RecipeSummary {
  return { id: 3, name: 'Roast tray', yield: 4, readyMeal: false, courseIds: [1], wholeMeal: false, tags: ['roast'], imageUrl: '', archived: false, totalMinutes: 45, advanceMinutes: 240, lastCookedOn: null, ...over }
}

export function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    id: 3, name: 'Roast tray', description: '', yield: 4, readyMeal: false, courses: [{ id: 1, name: 'Main' }], wholeMeal: false, tags: ['roast'], cooldownDays: null, leftoverUseByDays: null, reheatMinutes: null,
    source: { url: '', attribution: '' }, image: '', imageUrl: '', archived: false,
    lines: [{ ingredientId: 7, ingredient: 'garlic', quantity: 3, unit: 'clove', optional: false, note: '' }],
    steps: [
      { text: 'Marinate the chicken', kind: 'advance', durationMinutes: 0, leadTimeMinutes: 240, after: [], uses: [], image: '' },
      { text: 'Roast', kind: 'passive', durationMinutes: 40, leadTimeMinutes: 0, after: [], uses: [{ ingredientId: 7, quantity: 2, unit: 'clove' }], image: '', imageUrl: '/api/images/abc' },
    ],
    totalMinutes: 45, advanceMinutes: 240, advance: [{ step: 0, leadTimeMinutes: 240 }], createdAt: '', updatedAt: '', lastCookedOn: null,
    ...over,
  }
}

/** The household's active Courses as the pickers get them (household order; Main carries the flag). */
export const courseChoices: CourseChoice[] = [
  { id: 1, name: 'Main', main: true },
  { id: 2, name: 'Side', main: false },
  { id: 3, name: 'Starter', main: false },
  { id: 4, name: 'Dessert', main: false },
]
