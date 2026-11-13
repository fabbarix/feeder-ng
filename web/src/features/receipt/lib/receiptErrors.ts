// Every refusal and failure of the receipt flow as words (docs/design/receipt-reading.md section 9). Plain TypeScript, no React.
// The server's own message is never shown: the copy is by code.
import { availabilityOf } from '../../import/lib/readAvailability'
import { readStrings } from '../../import/strings'
import type { AssistantUnavailableReason } from '../../import/types'
import { receiptStrings as t } from '../strings'
import type { ReceiptErrorAction, ReceiptErrorCopy, ReceiptErrorInput } from '../types'

const REASONS: AssistantUnavailableReason[] = ['off', 'no_secret_key', 'no_key', 'key_unreadable', 'model_unavailable']
type SettingsProblem = 'assistant_bad_key' | 'assistant_billing' | 'assistant_forbidden' | 'assistant_model_unavailable'
const SETTINGS_PROBLEMS: string[] = ['assistant_bad_key', 'assistant_billing', 'assistant_forbidden', 'assistant_model_unavailable'] satisfies SettingsProblem[]

const copy = (message: string, action: ReceiptErrorAction = 'none'): ReceiptErrorCopy => ({ message, action })

/** "12 minutes", "30 seconds", "1 minute" (rounded up). */
export function readAgainWait(seconds: number): string {
  if (seconds < 60) {
    const s = Math.max(1, Math.ceil(seconds))
    return `${s} second${s === 1 ? '' : 's'}`
  }
  const m = Math.ceil(seconds / 60)
  return `${m} minute${m === 1 ? '' : 's'}`
}

/** The settings-problem copy (section 9): a User is sent to an Admin; an Admin gets the specific message (the Recipe Assistant's
 *  own words, as Import says them) and the link to Settings. Without a code (an apply's assistant_unavailable) the plain line. */
function settingsProblem(isAdmin: boolean, code?: SettingsProblem): ReceiptErrorCopy {
  if (!isAdmin) return copy(t.settingsProblem)
  if (code === undefined) return copy(t.settingsProblem, 'settings')
  const e = readStrings.errors
  return copy(`${e[code]} ${e[`${code}_hint`]}`, 'settings')
}

const FIXED: Record<string, ReceiptErrorCopy> = {
  assistant_unreachable: copy(t.unreachable, 'retry'),
  timeout: copy(t.unreachable, 'retry'),
  network: copy(t.network, 'retry'),
  assistant_busy: copy(t.busy, 'retry'),
  assistant_rate_limited: copy(t.busy, 'retry'),
  assistant_declined: copy(t.declined),
  assistant_output_too_long: copy(t.tooLong),
  assistant_invalid_output: copy(t.invalidOutput, 'retry'),
  no_receipt_found: copy(t.noReceipt),
  scans_empty: copy(t.scansEmpty),
  photos_empty: copy(t.photosEmpty),
  too_many_photos: copy(t.tooManyPhotos),
  photo_too_large: copy(t.photoTooLarge),
  photo_unsupported: copy(t.photoUnsupported),
  read_in_progress: copy(t.readInProgress),
  receipt_session_changed: copy(t.sessionChanged, 'readAgain'),
  receipt_read_gone: copy(t.readGone, 'readAgain'),
  receipt_read_not_done: copy(t.notDone, 'readAgain'),
  unknown_proposal: copy(t.unknownProposal, 'readAgain'),
  add_incomplete: copy(t.addIncomplete),
  receipt_apply_failed: copy(t.applyFailed, 'readAgain'),
}

/** The words for a failure by code, for an Admin or a User. Unknown codes get a plain line and Try again. */
export function describeReceiptError(error: ReceiptErrorInput, o: { isAdmin: boolean }): ReceiptErrorCopy {
  const { code } = error
  if (code === 'too_many_reads') {
    return copy(error.retryAfterSeconds !== undefined ? t.tooManyReads(readAgainWait(error.retryAfterSeconds)) : t.tooManyReadsFallback)
  }
  if (code === 'assistant_unavailable') {
    // The apply sends no reason: the settings-problem copy.
    if (error.reason === undefined || !REASONS.includes(error.reason as AssistantUnavailableReason)) return settingsProblem(o.isAdmin)
    const status = availabilityOf({ available: false, reason: error.reason as AssistantUnavailableReason, photos: false }, { isAdmin: o.isAdmin })
    return copy(status.message ?? t.settingsProblem, status.settingsLink ? 'settings' : 'none')
  }
  if (SETTINGS_PROBLEMS.includes(code)) return settingsProblem(o.isAdmin, code as SettingsProblem)
  return FIXED[code] ?? copy(t.generic, 'retry')
}
