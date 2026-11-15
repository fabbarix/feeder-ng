import type { FeatureModule } from '../../app/features'
import { lazyScreen } from '../../app/lazyScreen'

const feature: FeatureModule = {
  routes: [
    { path: '/settings/shops', element: lazyScreen(() => import('./screens/ShopsScreen'), 'ShopsScreen') },
    { path: '/settings/shops/:id', element: lazyScreen(() => import('./screens/ShopScreen'), 'ShopScreen') },
  ],
  navItems: [],
}

export const routes = feature.routes
export const navItems = feature.navItems

/** Integration point for the household feature: render inside SettingsPage. */
