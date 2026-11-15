import type { RouteObject } from 'react-router-dom'
import { lazyScreen } from '../../app/lazyScreen'

// The bottom-bar "Shop" tab: the Shopping List. The tab itself is in the app shell.
export const routes: RouteObject[] = [{ path: '/shop', element: lazyScreen(() => import('./screens/ShoppingScreen'), 'ShoppingScreen') }]

export { useShoppingList } from './hooks/useShoppingList'
// w6a: no `export { ShoppingScreen }` here: the router imports this index eagerly, so a static re-export kept the screen (and its
// stylesheet) in the entry chunk. Today no longer shows the screen (B9-44, TB-12); the route loads it on demand.
