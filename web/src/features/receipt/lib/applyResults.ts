// What the Scanned session does with an apply's `results` (design 7.2 step 5). Pure.
import type { ScanResult } from '../../scan/types'

const UNDO = /^receipt:[^:]+:undo:(.+?)(?:#\d+)?$/

/** The uuid of the scan an undo put back (`receipt:<readId>:undo:<orig>`, optional `#n`), else undefined. */
export function originalUuid(clientUuid: string): string | undefined {
  return UNDO.exec(clientUuid)?.[1]
}

/** Results that replace a scan of the session (a put-back), and the new scans. Never mutates its input. */
export function splitApplyResults(results: ScanResult[]): { replacements: { replaces: string; result: ScanResult }[]; others: ScanResult[] } {
  const replacements: { replaces: string; result: ScanResult }[] = []
  const others: ScanResult[] = []
  for (const result of results) {
    const replaces = originalUuid(result.clientUuid)
    if (replaces !== undefined) replacements.push({ replaces, result })
    else others.push(result)
  }
  return { replacements, others }
}
