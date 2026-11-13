// SR4: which row was just scanned, for its short wash (shop-scan-proposals.md 13.3 "Just scanned"). A scan (or a + on a row)
// grows the session by one entry and puts its row on top. The stored session coming back on load, an Undo, a Remove or a
// sync Result never washes. `pulse` alternates with every scan, so a rescan of the same row plays the wash again.
import { useState } from 'react'

export interface JustScanned {
  key: string
  pulse: 'a' | 'b'
}

interface Seen {
  count: number | null
  fresh: JustScanned | null
}

/** `scanCount` is the number of scans in the session, or null until the stored session has loaded; `topKey` the newest row. */
export function useJustScanned(scanCount: number | null, topKey: string | null): JustScanned | null {
  const [seen, setSeen] = useState<Seen>({ count: scanCount, fresh: null })
  if (scanCount !== seen.count) {
    const grew = seen.count !== null && scanCount !== null && scanCount > seen.count && topKey !== null
    setSeen({ count: scanCount, fresh: grew ? { key: topKey, pulse: seen.fresh?.pulse === 'a' ? 'b' : 'a' } : seen.fresh })
  }
  return seen.fresh
}
