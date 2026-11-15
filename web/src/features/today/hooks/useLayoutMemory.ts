// B9-44 (RES-05): Today's remembered shape. Read once when Today opens (drawn while the plan loads), and written again from each
// layout Today shows with data. React hook over lib/layoutMemory.
import { useEffect, useState } from 'react'
import { recallLayout, rememberLayout, type RememberedLayout } from '../lib/layoutMemory'
import type { TileId, TodayLayout } from '../types'

export function useLayoutMemory(layout: TodayLayout, rows: Partial<Record<TileId, number>>, withData: boolean): RememberedLayout {
  const [remembered] = useState(() => recallLayout())
  const key = JSON.stringify([layout.tiles, layout.empty, layout.failed, rows])
  useEffect(() => {
    if (withData) rememberLayout(layout, rows)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the layout and its rows
  }, [key, withData])
  return remembered
}
