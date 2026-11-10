import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ShoppingScreen } from './screens/ShoppingScreen'

// The bottom-bar "Shop" tab: the Shopping List. The tab itself is in the app shell.
export const routes: RouteObject[] = [{ path: '/shop', element: createElement(ShoppingScreen) }]

export { useShoppingList } from './hooks/useShoppingList'
// The Shopping List screen, which Today shows while a scan session is active.
export { ShoppingScreen } from './screens/ShoppingScreen'
