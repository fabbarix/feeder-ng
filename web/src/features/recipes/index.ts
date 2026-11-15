import type { FeatureModule } from '../../app/features'
import { lazyScreen } from '../../app/lazyScreen'

// "Recipes" is a fixed bottom-bar destination of the shell, so there is no navItem here.
// B9-59: the screens load on demand; the new and edit routes share one import, so one chunk.
const editorScreen = () => import('./screens/RecipeEditorScreen')
const feature: FeatureModule = {
  routes: [
    { path: '/recipes', element: lazyScreen(() => import('./screens/RecipesScreen'), 'RecipesScreen') },
    { path: '/recipes/new', element: lazyScreen(editorScreen, 'RecipeEditorScreen') },
    { path: '/recipes/:id', element: lazyScreen(() => import('./screens/RecipeDetailScreen'), 'RecipeDetailScreen') },
    { path: '/recipes/:id/edit', element: lazyScreen(editorScreen, 'RecipeEditorScreen') },
  ],
}

export const routes = feature.routes
