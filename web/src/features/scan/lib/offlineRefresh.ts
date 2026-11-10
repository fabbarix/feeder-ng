// When the phone's offline data must be fetched again (functional spec §10.3). Plain TypeScript, no React.
// The offline data holds the Catalog and the Products, so a barcode a Shop scan has just added to the Catalog
// is unknown to the phone until it is refreshed. Stub until the Developer implements it.
import type { ScanResult } from '../types'

/**
 * True when one of the results created a Product (`scan.productCreated`) or was merged into one that someone
 * else created (`scan.merged`): the Catalog changed, so the cached offline data is stale. False for plain scans,
 * Stock-takes and rejections.
 */
export function shouldRefreshOfflineData(_results: readonly ScanResult[]): boolean {
  return false
}
