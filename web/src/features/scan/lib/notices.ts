// Notices after a sync (functional spec §10.3). Plain TypeScript.
import { scanStrings } from '../strings'
import type { Op, ScanResult } from '../types'
import type { PictureFailure } from './queue'

export interface SyncNotice {
  kind: 'merged' | 'rejected' | 'picture'
  clientUuid: string
  text: string
}

/**
 * B9-54: `sent` (FlushResult.sent) tells a Tick's result from a Scan's; Ticks are left out.
 * One notice per rejected result and one per result merged into a Product that this same batch did NOT create
 * (a merge into the sender's own earlier creation is not news). Order follows the results. Texts from scanStrings.
 */
export function syncNotices(results: readonly ScanResult[], sent?: readonly Op[]): SyncNotice[] {
  // B9-54: a result answering a Tick (shop_tick / shop_untick) is the Shop's to tell (shop/lib/tickNotices), never a Scan notice
  const ticks = new Set((sent ?? []).filter((o) => o.kind === 'shop_tick' || o.kind === 'shop_untick').map((o) => o.clientUuid))
  results = results.filter((r) => !ticks.has(r.clientUuid))
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
