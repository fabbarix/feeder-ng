import type { RouteObject } from 'react-router-dom'
import { lazyScreen } from '../../app/lazyScreen'

// "Pantry" is a fixed primary destination (the shell's PRIMARY_NAV, route /pantry). The shell owns the old /stock address
// and redirects it, so this feature adds routes only: /pantry is the page, and /settings/storage-places manages the
// Storage Places.
export const routes: RouteObject[] = [
  { path: '/pantry', element: lazyScreen(() => import('./screens/StockScreen'), 'StockScreen') },
  { path: '/settings/storage-places', element: lazyScreen(() => import('./screens/StoragePlacesScreen'), 'StoragePlacesScreen') },
]

// For the Today screen (a later team).
export { SpoiledTile } from './components/SpoiledTile'
export { useSpoiledLots, useStockTotals } from './hooks/useStock'
