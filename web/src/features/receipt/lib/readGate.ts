// Whether "Read the receipt" can be pressed, and why not, in words (design 3.2, 7.3). Pure; the screen only shows it.
import type { ReadAvailability } from '../../import/lib/readAvailability'
import { receiptStrings as t } from '../strings'

export interface ReadGateInput {
  offline: boolean
  avail: Pick<ReadAvailability, 'loading' | 'enabled' | 'message' | 'photos' | 'photosMessage' | 'limitMessage'>
  photoCount: number
  /** Photos are being prepared. */
  preparing: boolean
  /** A read is starting or running. */
  reading: boolean
  /** A photo is open in the editor sheet (design 3.2). */
  editing?: boolean
}

export interface ReadGate {
  canRead: boolean
  /** Why the read cannot start, one line each, in the order they matter. */
  reasons: string[]
}

export function readGate({ offline, avail, photoCount, preparing, reading, editing = false }: ReadGateInput): ReadGate {
  const readable = !offline && !avail.loading && avail.enabled && avail.photos && !avail.limitMessage
  const reasons: string[] = []
  if (offline) reasons.push(t.needsConnection)
  if (!avail.loading && !avail.enabled && avail.message) reasons.push(avail.message)
  if (avail.limitMessage && avail.limitMessage !== avail.message) reasons.push(avail.limitMessage)
  if (!avail.loading && avail.enabled && !avail.photos && avail.photosMessage) reasons.push(avail.photosMessage)
  return { canRead: readable && photoCount > 0 && !preparing && !reading && !editing, reasons }
}

/**
 * What the Scanned list's "Read the receipt" row needs of the assistant (design 3.1): available when it is on and its model
 * reads photos (a used-up hourly limit still shows the row; the photos screen says when to try again). While the status
 * loads it is neither available nor an Admin's muted row, so nothing flashes.
 */
export function footerAvailability(avail: Pick<ReadAvailability, 'loading' | 'photos' | 'isAdmin'>): { assistantAvailable: boolean; isAdmin: boolean } {
  if (avail.loading) return { assistantAvailable: false, isAdmin: false }
  return { assistantAvailable: avail.photos, isAdmin: avail.isAdmin }
}

/** Whether the Scanned list shows the "Read the receipt" row at all (design 3.1): with a scan, and the assistant available or an Admin to turn it on. */
export function showsReadReceiptRow(o: { clientUuids: readonly string[]; assistantAvailable: boolean; isAdmin?: boolean }): boolean {
  return o.clientUuids.length > 0 && (o.assistantAvailable || o.isAdmin === true)
}
