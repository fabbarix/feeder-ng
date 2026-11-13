// Flat list of the style rules of recipes.css (or any stylesheet, cssRules) with the min-width of their @media, for the contract tests of R2-1 (jsdom does not lay out).

import { cssRules, type Rule } from '../../test/cssRules'

export { cssRules, type Rule }

const recipes = cssRules(['features/recipes/recipes.css'])
export const recipeRules: Rule[] = recipes.rules
export const { rulesFor, valueAt, valueFor } = recipes
