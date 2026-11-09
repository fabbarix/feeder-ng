import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { ShopScreen } from './screens/ShopScreen'
import { ShopsScreen } from './screens/ShopsScreen'

const feature: FeatureModule = {
  routes: [
    { path: '/settings/shops', element: createElement(ShopsScreen) },
    { path: '/settings/shops/:id', element: createElement(ShopScreen) },
  ],
  navItems: [{ id: 'shops', label: 'Shops', path: '/settings/shops', placement: 'menu', order: 40 }],
}

export const routes = feature.routes
export const navItems = feature.navItems

/** Integration point for the household feature: render inside SettingsPage. */
export { ShopsSettingsLink } from './components/ShopsSettingsLink'
