import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

/** Where the Stock header's "Stock-take" button goes: the Scan screen straight into Stock-take (skips the Shop picker). */
export const STOCK_TAKE_PATH = '/scan?mode=stocktake'

/** Returns a callback that navigates to STOCK_TAKE_PATH (react-router `useNavigate`). */
export function useStockTakeEntry(): () => void {
  const navigate = useNavigate()
  return useCallback(() => navigate(STOCK_TAKE_PATH), [navigate])
}
