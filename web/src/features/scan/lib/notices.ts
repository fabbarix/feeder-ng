// Notices after a sync (functional spec §10.3). Plain TypeScript. Stubs until implemented.
import type { ScanResult } from '../types'

export interface SyncNotice {
  kind: 'merged' | 'rejected'
  clientUuid: string
  text: string
}

/**
 * One notice per rejected result and one per result merged into a Product that this same batch did NOT create
 * (a merge into the sender's own earlier creation is not news). Order follows the results. Texts from scanStrings.
 */
export function syncNotices(results: readonly ScanResult[]): SyncNotice[] {
  void results
  throw new Error('not implemented')
}
