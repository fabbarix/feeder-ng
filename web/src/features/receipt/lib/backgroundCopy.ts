// b8-rxweb: the words and the decisions of the background read, pure (docs/dev/design/b8-rxweb.md). No React.
import { receiptStrings as t } from '../strings'
import type { BackgroundRead } from './backgroundRead'
import { describeReceiptError } from './receiptErrors'

export const REVIEW_PATH = '/scan/receipt/review'
export const PHOTOS_PATH = '/scan/receipt'

/** "Receipt read: review 9 changes", "... 1 change", "Receipt read: nothing to change". */
export function readyTitle(changes: number): string {
  return changes === 0 ? t.nothingToChange : t.readyTitle(changes)
}

export interface BackgroundRowView {
  kind: 'reading' | 'ready' | 'failed'
  title: string
  meta: string
  /** Where pressing the row goes: the progress or the photos (a failure), or the Receipt review. */
  goes: 'photos' | 'review'
}

/** The Scanned list's row for a read of this Shop (the footer shows it). */
export function rowView(state: BackgroundRead, o: { isAdmin: boolean }): BackgroundRowView {
  if (state.status === 'reading') {
    return { kind: 'reading', title: t.reading, meta: state.connectionLost ? t.lostConnection : t.readingRowMeta, goes: 'photos' }
  }
  if (state.status === 'ready') {
    return { kind: 'ready', title: readyTitle(state.changes), meta: t.nothingChanges, goes: 'review' }
  }
  return { kind: 'failed', title: t.failedRowTitle, meta: describeReceiptError(state.error, o).message, goes: 'photos' }
}

export interface ToastPlan {
  message: string
  status: 'success' | 'error'
  actionLabel: string
  to: typeof REVIEW_PATH | typeof PHOTOS_PATH
}

/** The User is looking at the read already on the Scan screen or under the receipt routes: no toast there. */
export function isOnReceiptPaths(pathname: string): boolean {
  return pathname === '/scan' || pathname === PHOTOS_PATH || pathname.startsWith(`${PHOTOS_PATH}/`)
}

/**
 * The toast when a read finishes elsewhere in the app; undefined while reading, on the Scan or receipt screens, and for a ready read
 * with nothing to change (b8-polish: the Scanned row still says so).
 */
export function finishedToast(state: BackgroundRead, pathname: string, o: { isAdmin: boolean }): ToastPlan | undefined {
  if (state.status === 'reading' || isOnReceiptPaths(pathname)) return undefined
  if (state.status === 'ready') {
    if (state.changes === 0) return undefined
    return { message: readyTitle(state.changes), status: 'success', actionLabel: t.reviewAction, to: REVIEW_PATH }
  }
  return { message: describeReceiptError(state.error, o).message, status: 'error', actionLabel: t.readAgain, to: PHOTOS_PATH }
}
