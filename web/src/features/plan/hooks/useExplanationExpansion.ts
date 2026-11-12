import { useCallback, useMemo, useState } from 'react'
import type { ExplanationGroup } from '../lib/couldntExclusions'

export interface ExplanationExpansion {
  isOpen: (key: string) => boolean
  toggle: (key: string) => void
  /** The id of the cell the URL hash names ("cell-2026-11-13-4-2") when a group has it; else null. The screen focuses it. */
  targetId: string | null
}

const NO_FLIPS: ReadonlySet<string> = new Set()

const cellId = (c: { date: string; mealSlotId: number; courseId: number }): string => `cell-${c.date}-${c.mealSlotId}-${c.courseId}`

/**
 * Which explanation Tiles show their full list of cells. The one holding the cell named by `hash` ("#cell-...") starts open
 * and is the target. The state is the flips from that default, so it follows the groups when they arrive after the hash.
 */
export function useExplanationExpansion(groups: ExplanationGroup[], hash: string): ExplanationExpansion {
  const wanted = hash.replace(/^#/, '')
  const target = useMemo(() => {
    if (!wanted) return null
    for (const g of groups) {
      const cell = g.cells.find((c) => cellId(c) === wanted)
      if (cell) return { key: g.key, id: wanted }
    }
    return null
  }, [groups, wanted])
  // The manual flips belong to the hash they were made under: a new hash (another cell) starts from its own default.
  const [flips, setFlips] = useState<{ hash: string; keys: ReadonlySet<string> }>({ hash: wanted, keys: new Set() })
  const flipped = flips.hash === wanted ? flips.keys : NO_FLIPS
  const isOpen = useCallback((key: string) => (key === target?.key) !== flipped.has(key), [target, flipped])
  const toggle = useCallback(
    (key: string) => {
      setFlips((prev) => {
        const keys = new Set(prev.hash === wanted ? prev.keys : NO_FLIPS)
        if (keys.has(key)) keys.delete(key)
        else keys.add(key)
        return { hash: wanted, keys }
      })
    },
    [wanted],
  )
  return { isOpen, toggle, targetId: target?.id ?? null }
}
