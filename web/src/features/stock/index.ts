import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { StockScreen } from './screens/StockScreen'

// "Stock" is already a fixed item of the avatar menu, so this feature adds a route only.
export const routes: RouteObject[] = [{ path: '/stock', element: createElement(StockScreen) }]

// For the Today screen (a later team).
export { SpoiledTile } from './components/SpoiledTile'
export { useSpoiledLots, useToday } from './hooks/useStock'
