// Notices after a sync (functional spec §10.3). Plain TypeScript. Stubs until implemented.
import { scanStrings } from '../strings'
import type { ScanResult } from '../types'
import type { PictureFailure } from './queue'

export interface SyncNotice {
  kind: 'merged' | 'rejected' | 'picture'
  clientUuid: string
  text: string
}

/**
 * One notice per rejected result and one per result merged into a Product that this same batch did NOT create
 * (a merge into the sender's own earlier creation is not news). Order follows the results. Texts from scanStrings.
 */
export function syncNotices(results: readonly ScanResult[]): SyncNotice[] {
  const createdInBatch = new Set<number>()
  for (const r of results) if (r.scan?.productCreated) createdInBatch.add(r.scan.productId)
  const notices: SyncNotice[] = []
  for (const r of results) {
    if (r.status === 'rejected') {
      notices.push({ kind: 'rejected', clientUuid: r.clientUuid, text: scanStrings.rejected(r.error?.message ?? '') })
      continue
    }
    const merged = r.scan?.merged
    if (merged && !createdInBatch.has(merged.productId)) {
      const text = merged.pictureFilled ? scanStrings.mergedWithPicture(merged.productName) : scanStrings.merged(merged.productName)
      notices.push({ kind: 'merged', clientUuid: r.clientUuid, text })
    }
  }
  return notices
}

/** PPX: one notice per Picture the queue gave up ("The picture of X was too large to send, so it was added without one"), in order. */
export function pictureNotices(failures: readonly PictureFailure[]): SyncNotice[] {
  return failures.map((f) => ({ kind: 'picture', clientUuid: f.clientUuid, text: scanStrings.pictureDropped(f.productName, f.reason) }))
}
