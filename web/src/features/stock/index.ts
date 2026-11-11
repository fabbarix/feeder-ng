import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { StockScreen } from './screens/StockScreen'
import { StoragePlacesScreen } from './screens/StoragePlacesScreen'

// "Pantry" (route /stock) is already a fixed item of the avatar menu, so this feature adds routes only: /pantry is the
// same page, and /settings/storage-places manages the Storage Places.
export const routes: RouteObject[] = [
  { path: '/stock', element: createElement(StockScreen) },
  { path: '/pantry', element: createElement(StockScreen) },
  { path: '/settings/storage-places', element: createElement(StoragePlacesScreen) },
]

// For the Today screen (a later team).
export { SpoiledTile } from './components/SpoiledTile'
export { useSpoiledLots, useStockTotals } from './hooks/useStock'
