/** Where the Stock header's "Stock-take" button goes: the Scan screen straight into Stock-take (skips the Shop picker). */
export const STOCK_TAKE_PATH = '/scan?mode=stocktake'

/** Returns a callback that navigates to STOCK_TAKE_PATH (react-router `useNavigate`). */
export function useStockTakeEntry(): () => void {
  throw new Error('not implemented')
}
