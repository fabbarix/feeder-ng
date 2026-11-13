import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { IngredientScreen } from './screens/IngredientScreen'
import { IngredientsScreen } from './screens/IngredientsScreen'
import { SuppliesScreen } from './screens/SuppliesScreen'
import { SupplyScreen } from './screens/SupplyScreen'

// Reached from Settings > Catalogue (spec decision 43): no menu item and no bottom-bar item.
// H5 (decision D5): the Supplies are the same Ingredients of kind "supply", with their own routes.
const feature: FeatureModule = {
  routes: [
    { path: '/ingredients', element: createElement(IngredientsScreen) },
    { path: '/ingredients/:id', element: createElement(IngredientScreen) },
    { path: '/supplies', element: createElement(SuppliesScreen) },
    { path: '/supplies/:id', element: createElement(SupplyScreen) },
  ],
  navItems: [],
}

export const routes = feature.routes
export const navItems = feature.navItems
