import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { RecipeDetailScreen } from './screens/RecipeDetailScreen'
import { RecipeEditorScreen } from './screens/RecipeEditorScreen'
import { RecipesScreen } from './screens/RecipesScreen'

// "Recipes" is a fixed bottom-bar destination of the shell, so there is no navItem here.
const feature: FeatureModule = {
  routes: [
    { path: '/recipes', element: createElement(RecipesScreen) },
    { path: '/recipes/new', element: createElement(RecipeEditorScreen) },
    { path: '/recipes/:id', element: createElement(RecipeDetailScreen) },
    { path: '/recipes/:id/edit', element: createElement(RecipeEditorScreen) },
  ],
}

export const routes = feature.routes
