// Test helper (B9-10, WP-RX-0): the Recipes feature's stylesheets as one text. recipes.css was split into recipes-list.css,
// recipe-detail.css and recipe-editor.css; a contract test about one rule reads them all, so it does not care which file the rule is in.
// recipes.sweep.test.ts pins the split itself.
import { readSource } from '../plan/test-css'

// B9-37: recipe-editor.css is held to 600 lines, so the editor flow may split it; the three names below are where its parts go (a name that
// does not exist is skipped).
export const RECIPES_CSS_FILES = [
  'recipes.css', 'recipes-list.css', 'recipe-detail.css', 'recipe-editor.css',
  'recipe-editor.lines.css', 'recipe-editor.steps.css', 'recipe-editor.sections.css',
] as const

/** The paths (under web/src) of the Recipes stylesheets that exist. */
export const recipesCssPaths = (): string[] => RECIPES_CSS_FILES.map((f) => `features/recipes/${f}`).filter((p) => readSource(p) !== '')

/** The text of every Recipes stylesheet, in order, comments kept. */
export const readRecipesCss = (): string => recipesCssPaths().map((p) => readSource(p)).join('\n')
