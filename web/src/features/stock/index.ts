import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { StockScreen } from './screens/StockScreen'
import { StoragePlacesScreen } from './screens/StoragePlacesScreen'

// "Pantry" is a fixed primary destination (the shell's PRIMARY_NAV, route /pantry). The shell owns the old /stock address
// and redirects it, so this feature adds routes only: /pantry is the page, and /settings/storage-places manages the
// Storage Places.
export const routes: RouteObject[] = [
  { path: '/pantry', element: createElement(StockScreen) },
  { path: '/settings/storage-places', element: createElement(StoragePlacesScreen) },
]

// For the Today screen (a later team).
export { SpoiledTile } from './components/SpoiledTile'
export { useSpoiledLots, useStockTotals } from './hooks/useStock'

// B9-45 (PC-02): the one Stock-shortfall notice and the one Correct Stock sheet (the Plan, Today and Cook Mode share them).
export { ShortfallNotice } from './components/ShortfallNotice'
export { StockCorrectionSheet } from './components/StockCorrectionSheet'
export { useStockCorrection } from './hooks/useStockCorrection'
export type { ShortfallGroup } from './lib/shortfall'
