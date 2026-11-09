// Plan builders shared by the tests of this feature.
import type { IngredientMatch, Plan, RecipeStatus, UnitPrompt } from './types'

export function match(over: Partial<IngredientMatch> & { key: string }): IngredientMatch {
  return {
    name: over.key,
    status: 'new',
    suggestions: [],
    resolved: true,
    usedBy: ['$.recipes[0].ingredients[0]'],
    effective: { key: over.key, action: 'create' },
    ...over,
  }
}

export function prompt(over: Partial<UnitPrompt> = {}): UnitPrompt {
  return { key: 'spinach', ingredient: 'spinach', unit: 'handful', base: 'g', usedBy: ['$.recipes[0].ingredients[1]'], answered: false, ...over }
}

export function recipe(over: Partial<RecipeStatus> = {}): RecipeStatus {
  return { index: 0, name: 'Chicken tikka traybake', status: 'new', resolved: true, ...over }
}

export function plan(over: Partial<Plan> = {}): Plan {
  return { ingredients: [], unitPrompts: [], recipes: [], problems: [], warnings: [], ready: true, ...over }
}
