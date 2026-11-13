// BR-E: plan and Confirm-answer builders for Base recipe lines, in the exact JSON of internal/recipefile (plan.go, httpapi.go).
import type { BaseRecipeLine, BaseRecipeSuggestion, ImportResult, ImportTakeOverAsk } from './types'

/** A tile as `plan().baseRecipeLines[]`: "500 ml béchamel" of Lasagne, no suggestion, no answer yet. */
export function baseLine(over: Partial<BaseRecipeLine> = {}): BaseRecipeLine {
  return { path: '$.recipes[0].ingredients[1]', name: 'béchamel', quantity: 500, unit: 'ml', suggestions: [], resolved: false, ...over }
}

export const useSuggestion = (recipeId: number, name: string, exact = true): BaseRecipeSuggestion => ({ kind: 'base', recipeId, name, exact })
export const fileSuggestion = (recipeIndex: number, name: string, exact = true): BaseRecipeSuggestion => ({ kind: 'file', recipeIndex, name, exact })
export const plannableSuggestion = (recipeId: number, name: string, exact = false): BaseRecipeSuggestion => ({ kind: 'plannable', recipeId, name, exact })

/** `plan().takeOvers[]`: the P7 ask for the new Base recipe Béchamel and the plain Ingredient béchamel. */
export function takeOver(over: Partial<ImportTakeOverAsk> = {}): ImportTakeOverAsk {
  return {
    path: '$.recipes[0].ingredients[1]',
    name: 'Béchamel',
    ingredient: { id: 5, name: 'béchamel', baseUnit: 'ml' },
    recipes: [{ id: 11, name: 'Moussaka' }, { id: 12, name: 'Lasagne' }],
    stockLots: 1,
    convertible: true,
    resolved: false,
    ...over,
  }
}

/** The Confirm answer of internal/recipefile/httpapi: `recipes[{index,id,name,action,baseRecipe,line?,readNext?}]`. */
export function confirmed(recipes: ImportResult['recipes'], over: Partial<ImportResult> = {}): ImportResult {
  return { recipes, ingredientsCreated: 0, conversionsAdded: 0, coursesCreated: 0, coursesUnarchived: 0, ...over }
}
export const applied = (over: Partial<ImportResult['recipes'][number]> = {}): ImportResult['recipes'][number] => ({
  index: 0, id: 1, name: 'Lasagne', action: 'created', baseRecipe: false, ...over,
})
