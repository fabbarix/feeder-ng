// B9-44 (TB-12): the words of the "Shopping at <Shop>" tile. Plain TypeScript.
import { todayStrings as s } from '../strings'

const MINUTE = 60_000

export function shoppingTitle(shopName: string): string {
  return s.shoppingTitle(shopName)
}

/** "7 scanned · 11 Lines to get · last Scan 4 min ago"; Lines to get is left out at 0, under a minute is "just now". */
export function shoppingMeta(session: { scanned: number; lastScanAt: number }, linesToGet: number, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - session.lastScanAt) / MINUTE))
  const parts = [s.shoppingScanned(session.scanned)]
  if (linesToGet > 0) parts.push(s.shoppingLines(linesToGet))
  parts.push(minutes < 1 ? s.shoppingJustNow : s.shoppingMinutesAgo(minutes))
  return parts.join(' · ')
}
