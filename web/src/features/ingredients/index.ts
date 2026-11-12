import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { IngredientScreen } from './screens/IngredientScreen'
import { IngredientsScreen } from './screens/IngredientsScreen'

// Reached from Settings > Catalogue (spec decision 43): no menu item and no bottom-bar item.
const feature: FeatureModule = {
  routes: [
    { path: '/ingredients', element: createElement(IngredientsScreen) },
    { path: '/ingredients/:id', element: createElement(IngredientScreen) },
  ],
  navItems: [],
}

export const routes = feature.routes
export const navItems = feature.navItems
