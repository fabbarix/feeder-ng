import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { ProductScreen } from './screens/ProductScreen'
import { ProductsScreen } from './screens/ProductsScreen'

const feature: FeatureModule = {
  routes: [
    { path: '/products', element: createElement(ProductsScreen) },
    { path: '/products/:id', element: createElement(ProductScreen) },
  ],
  navItems: [],
}

export const routes = feature.routes
export const navItems = feature.navItems

/** Integration point for the ingredients feature: render inside IngredientScreen. */
export { IngredientProducts } from './components/IngredientProducts'
export { productsApi } from './api'
export { defaultProductName, formatPackSize } from './lib/names'
