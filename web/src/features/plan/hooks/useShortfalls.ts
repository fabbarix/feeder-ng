// B9-45 (PC-02): the ONE Stock-shortfall notice of a cook flow: one group per Cooked meal (newest last; the same meal again replaces its
// group), its Dismiss, and the ONE Correct Stock sheet, whose save settles the whole notice. Shared by useCookFlow and useAllCookedFlow.
import { useCallback, useMemo, useState } from 'react'
import type { UnitSystem } from '../../../lib/units'
import { usePreferences } from '../../settings/hooks/usePreferences'
import { useStockCorrection, type StockCorrectionController } from '../../stock/hooks/useStockCorrection'
import type { ShortfallGroup } from '../../stock/lib/shortfall'
import { withGroup } from '../lib/cook'
import type { StockWarning } from '../types'

export interface Shortfalls {
  groups: ShortfallGroup[]
  /** Every group's warnings, one per Ingredient (first seen first). */
  warnings: StockWarning[]
  add: (group: ShortfallGroup | null) => void
  remove: (groupId: string) => void
  dismiss: () => void
  dismissWarning: (ingredientId: number) => void
  correct: StockCorrectionController
  system: UnitSystem
}

export function useShortfalls(): Shortfalls {
  const [groups, setGroups] = useState<ShortfallGroup[]>([])
  const system = usePreferences(groups.length > 0).preferences.units
  const add = useCallback((group: ShortfallGroup | null) => setGroups((gs) => withGroup(gs, group)), [])
  const remove = useCallback((groupId: string) => setGroups((gs) => gs.filter((g) => g.id !== groupId)), [])
  const dismiss = useCallback(() => setGroups([]), [])
  const dismissWarning = useCallback(
    (ingredientId: number) =>
      setGroups((gs) => gs.map((g) => ({ ...g, warnings: g.warnings.filter((w) => w.ingredientId !== ingredientId) })).filter((g) => g.warnings.length > 0)),
    [],
  )
  const correct = useStockCorrection(groups, dismiss, system)
  const warnings = useMemo(() => {
    const seen = new Map<number, StockWarning>()
    for (const g of groups) for (const w of g.warnings) if (!seen.has(w.ingredientId)) seen.set(w.ingredientId, w)
    return [...seen.values()]
  }, [groups])
  return { groups, warnings, add, remove, dismiss, dismissWarning, correct, system }
}
