// SR4: React state of the Scanned / To get choice. It is remembered per device, and a new scan switches back to Scanned
// (shop-scan-proposals.md 13.2). The storage is read and written through lib/listView.
import { useState } from 'react'
import { readListView, writeListView, type ListView } from '../lib/listView'

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export interface ListViewController {
  view: ListView
  choose: (view: ListView) => void
}

/** `scanCount` is the number of scans of the session: a count that grows (a scan) shows the Scanned list. */
export function useListView(scanCount: number): ListViewController {
  const [view, setView] = useState<ListView>(() => readListView(localStorageOrNull()))
  const [seen, setSeen] = useState(scanCount)
  if (scanCount > seen) {
    setSeen(scanCount)
    setView('scanned')
  }
  return {
    view,
    choose: (next) => {
      setView(next)
      writeListView(localStorageOrNull(), next)
    },
  }
}
