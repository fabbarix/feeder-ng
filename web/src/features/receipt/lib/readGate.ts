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
