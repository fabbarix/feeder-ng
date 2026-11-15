import type { FeatureModule } from '../../app/features'
import { lazyScreen } from '../../app/lazyScreen'

// Reached from Settings > Catalogue (spec decision 43): no menu item and no bottom-bar item.
// H5 (decision D5): the Supplies are the same Ingredients of kind "supply", with their own routes.
const feature: FeatureModule = {
  routes: [
    { path: '/ingredients', element: lazyScreen(() => import('./screens/IngredientsScreen'), 'IngredientsScreen') },
    { path: '/ingredients/:id', element: lazyScreen(() => import('./screens/IngredientScreen'), 'IngredientScreen') },
    { path: '/supplies', element: lazyScreen(() => import('./screens/SuppliesScreen'), 'SuppliesScreen') },
    { path: '/supplies/:id', element: lazyScreen(() => import('./screens/SupplyScreen'), 'SupplyScreen') },
  ],
  navItems: [],
}

export const routes = feature.routes
export const navItems = feature.navItems
