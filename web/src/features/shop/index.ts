import type { RouteObject } from 'react-router-dom'
import { lazyScreen } from '../../app/lazyScreen'

// The bottom-bar "Shop" tab: the Shopping List. The tab itself is in the app shell.
export const routes: RouteObject[] = [{ path: '/shop', element: lazyScreen(() => import('./screens/ShoppingScreen'), 'ShoppingScreen') }]

export { useShoppingList } from './hooks/useShoppingList'
// The Shopping List screen, which Today shows while a scan session is active.
export { ShoppingScreen } from './screens/ShoppingScreen'
