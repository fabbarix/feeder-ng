// Plan builders shared by the tests of this feature.
import { vi } from 'vitest'
import type { UseImportReview } from './hooks/useImportReview'
import type { IngredientMatch, Plan, RecipeStatus, ReviewPhoto, UnitPrompt } from './types'

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

/** The Recipe Assistant part of a UseImportReview mock: a review that came from a file (no photos). */
export function reviewExtras(over: Partial<UseImportReview> = {}): Pick<UseImportReview, 'reviewId' | 'adopt' | 'photos' | 'photoRecipes' | 'photoChoice' | 'setPhotoEnabled' | 'choosePhoto' | 'choosePhotoRecipe' | 'readNote'> {
  return {
    reviewId: undefined,
    adopt: vi.fn(),
    photos: [],
    photoRecipes: [],
    photoChoice: { enabled: false, photo: 0, recipe: 0 },
    setPhotoEnabled: vi.fn(),
    choosePhoto: vi.fn(),
    choosePhotoRecipe: vi.fn(),
    readNote: undefined,
    ...over,
  }
}

export function photos(n: number): ReviewPhoto[] {
  return Array.from({ length: n }, (_, index) => ({ index, width: 1600, height: 1200 }))
}
