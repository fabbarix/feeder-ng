// Plan builders shared by the tests of this feature.
import { vi } from 'vitest'
import type { UseImportReview } from './hooks/useImportReview'
import type { CourseMatch, IngredientMatch, Plan, RecipeStatus, ReviewPhoto, UnitPrompt } from './types'

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
  return { ingredients: [], unitPrompts: [], recipes: [], courses: [], baseRecipeLines: [], takeOvers: [], problems: [], warnings: [], ready: true, ...over }
}

/** The Recipe Assistant part of a UseImportReview mock: a review that came from a file (no photos). */
export function reviewExtras(over: Partial<UseImportReview> = {}): Pick<UseImportReview, 'reviewId' | 'adopt' | 'photos' | 'photoRecipes' | 'photoChoice' | 'setPhotoEnabled' | 'choosePhoto' | 'choosePhotoRecipe' | 'readNote' | 'chooseBaseRecipeLine' | 'chooseTakeOver' | 'confirmProblem' | 'takeOverPrompt' | 'answerTakeOverPrompt' | 'cancelTakeOverPrompt' | 'startReadNext' | 'readNextFor'> {
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
    // BR-E: the Base recipe part of a UseImportReview mock.
    chooseBaseRecipeLine: vi.fn(),
    chooseTakeOver: vi.fn(),
    confirmProblem: undefined,
    takeOverPrompt: undefined,
    answerTakeOverPrompt: vi.fn(),
    cancelTakeOverPrompt: vi.fn(),
    startReadNext: vi.fn(),
    readNextFor: undefined,
    ...over,
  }
}

export function photos(n: number): ReviewPhoto[] {
  return Array.from({ length: n }, (_, index) => ({ index, width: 1600, height: 1200 }))
}

/** A Course row of the Import Review: an unknown name that defaults to "use the main Course" (id 1). */
export function courseRow(over: Partial<CourseMatch> & { key: string }): CourseMatch {
  return {
    name: over.key,
    status: 'unknown',
    resolved: true,
    usedBy: ['$.recipes[0].courses[0]'],
    effective: { key: over.key, action: 'use', courseId: 1 },
    ...over,
  }
}

/** The Course part of a UseImportReview mock. */
export function courseExtras(over: Partial<UseImportReview> = {}): Pick<UseImportReview, 'chooseCourseUse' | 'chooseCourseSkip' | 'chooseCourseAdd' | 'chooseCourseUnarchive' | 'courseForbidden'> {
  return {
    chooseCourseUse: vi.fn(),
    chooseCourseSkip: vi.fn(),
    chooseCourseAdd: vi.fn(),
    chooseCourseUnarchive: vi.fn(),
    courseForbidden: false,
    ...over,
  }
}
