import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { ExportScreen } from './screens/ExportScreen'
import { ImportScreen } from './screens/ImportScreen'

// Reached from the Recipes screen (RecipeFileActions); no nav item of its own.
const feature: FeatureModule = {
  routes: [
    { path: '/recipes/import', element: createElement(ImportScreen) },
    { path: '/recipes/export', element: createElement(ExportScreen) },
  ],
}

export const routes = feature.routes
