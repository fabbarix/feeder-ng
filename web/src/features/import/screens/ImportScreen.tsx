import type { ReactNode } from 'react'

/**
 * Route /recipes/import. Phase 'source': ImportSource (+ ValidationErrorsTile when opening failed).
 * Phase 'reviewing': a BentoGrid of step tiles from lib/reviewSummary.reviewSteps: problems (list of Problem paths), IngredientMatchTile per
 * Ingredient, UnitPromptTile per prompt, RecipeConflictTile per conflicting Recipe, ImageWarningsTile, then ConfirmTile.
 * Phase 'done': importStrings.done(n), links "Open Recipes" (/recipes) and "Start over". `stale` shows importStrings.stale with "Start over".
 * All state comes from useImportReview.
 */
export function ImportScreen(): ReactNode {
  throw new Error('not implemented')
}
