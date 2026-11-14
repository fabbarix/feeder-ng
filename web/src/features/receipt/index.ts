// The receipt feature (docs/design/receipt-reading.md): two full-screen routes, reached from the Scanned list's footer row.
import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ReceiptPhotosScreen } from './screens/ReceiptPhotosScreen'
import { ReceiptReviewRoute } from './screens/ReceiptReviewRoute'

export const routes: RouteObject[] = [
  { path: '/scan/receipt', element: createElement(ReceiptPhotosScreen) },
  { path: '/scan/receipt/review', element: createElement(ReceiptReviewRoute) },
]

export { ReadReceiptFooter } from './components/ReadReceiptFooter'
export { ReceiptReadWatcher } from './components/ReceiptReadWatcher'
export { resetBackgroundRead } from './lib/backgroundRead'
export type { ReadReceiptFooterProps } from './components/ReadReceiptFooter'
export { ReceiptReviewScreen } from './screens/ReceiptReviewScreen'
export { ReceiptReviewRoute } from './screens/ReceiptReviewRoute'
export type { AddSheetRenderProps } from './screens/ReceiptReviewScreen'
export { useReceiptApplied } from './hooks/useReceiptApplied'
export { useReceiptSession } from './hooks/useReceiptSession'
export { publishReceiptSession } from './lib/receiptSession'
export { emitReceiptApplied } from './lib/appliedEvents'
export { splitApplyResults, originalUuid } from './lib/applyResults'
export { footerAvailability } from './lib/readGate'
