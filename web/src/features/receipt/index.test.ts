// RR4: what features/receipt/index.ts exports and registers. Routes are discovered from `routes` (app/features.ts).
// Pinned exports of ./index:
//   routes: RouteObject[]    '/scan/receipt' -> ReceiptPhotosScreen, '/scan/receipt/review' -> ReceiptReviewRoute (the review with its Add… sheet)
//   ReadReceiptFooter + its props type            the footer content for SR4's ScannedList `footer` slot
//   useReceiptApplied, publishReceiptSession, splitApplyResults, originalUuid, emitReceiptApplied?   (the Scan screen's side of the hand-over)
//   ReceiptReviewScreen + AddSheetRenderProps     for the integration to pass renderAdd
// Pinned in app: both routes are chromeless (no bars, the page has its own Back and sticky action bar) and narrow.
import { describe, expect, it } from 'vitest'
import { collectFeatures } from '../../app/features'
import { isChromeless } from '../../app/chromeless'
import { explicitPageWidth } from '../../app/pageWidths'
import * as feature from './index'
import { ReadReceiptFooter } from './components/ReadReceiptFooter'
import { useReceiptApplied } from './hooks/useReceiptApplied'
import { splitApplyResults, originalUuid } from './lib/applyResults'
import { publishReceiptSession } from './lib/receiptSession'
import { ReceiptPhotosScreen } from './screens/ReceiptPhotosScreen'
import { ReceiptReviewRoute } from './screens/ReceiptReviewRoute'
import { ReceiptReviewScreen } from './screens/ReceiptReviewScreen'

describe('routes', () => {
  it('registers the photos and the review routes', () => {
    expect(feature.routes.map((r) => r.path).sort()).toEqual(['/scan/receipt', '/scan/receipt/review'])
  })
  it('the elements are the two screens', () => {
    const el = (path: string) => (feature.routes.find((r) => r.path === path)?.element as { type: unknown } | undefined)?.type
    expect(el('/scan/receipt')).toBe(ReceiptPhotosScreen)
    expect(el('/scan/receipt/review')).toBe(ReceiptReviewRoute)
  })
  it('does not clash with the Scan feature\'s /scan', () => {
    expect(() => collectFeatures({ '../features/receipt/index.ts': { routes: feature.routes }, '../features/scan/index.ts': { routes: [{ path: '/scan' }] } })).not.toThrow()
  })
  it.each(['/scan/receipt', '/scan/receipt/review'])('%s is chromeless (no bottom nav) and narrow', (path) => {
    expect(isChromeless(path)).toBe(true)
    expect(explicitPageWidth(path)).toBe('narrow')
  })
  it('the Scan screen itself keeps its bars', () => {
    expect(isChromeless('/scan')).toBe(false)
    expect(isChromeless('/scan/receipts')).toBe(false)
  })
})

describe('exports', () => {
  it('the footer content for the Scanned list', () => {
    expect(feature.ReadReceiptFooter).toBe(ReadReceiptFooter)
  })
  it('the Scan screen\'s side of the hand-over', () => {
    expect(feature.useReceiptApplied).toBe(useReceiptApplied)
    expect(feature.publishReceiptSession).toBe(publishReceiptSession)
    expect(feature.splitApplyResults).toBe(splitApplyResults)
    expect(feature.originalUuid).toBe(originalUuid)
  })
  it('the review screen, for the integration to pass its Add flow', () => {
    expect(feature.ReceiptReviewScreen).toBe(ReceiptReviewScreen)
  })
  it('has no navItems: the screens are reached from the Scanned list', () => {
    expect((feature as { navItems?: unknown }).navItems).toBeUndefined()
  })
})
