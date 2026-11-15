import type { FeatureModule } from '../../app/features'
import { lazyScreen } from '../../app/lazyScreen'

const feature: FeatureModule = {
  routes: [
    { path: '/products', element: lazyScreen(() => import('./screens/ProductsScreen'), 'ProductsScreen') },
    { path: '/products/:id', element: lazyScreen(() => import('./screens/ProductScreen'), 'ProductScreen') },
  ],
  navItems: [],
}

export const routes = feature.routes
export const navItems = feature.navItems

/** Integration point for the ingredients feature: render inside IngredientScreen. */
export { IngredientProducts } from './components/IngredientProducts'
export { productsApi } from './api'
export { defaultProductName, formatPackSize } from './lib/names'
