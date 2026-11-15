// B9-44 (PC-02 on Today, ruling 2): Today shows ONE Stock-shortfall notice under To confirm for both of its cook flows (a Course's Mark as
// Cooked and a Meal Slot's Mark all Cooked): their groups together, one Dismiss for all, and ONE Correct Stock sheet whose save settles the
// whole notice. React hook over the flows' own state.
import { useCallback, useMemo } from 'react'
import type { UnitSystem } from '../../../lib/units'
import { useStockCorrection, type ShortfallGroup } from '../../stock'
import type { StockCorrectionController } from '../../stock/hooks/useStockCorrection'

interface FlowShortfalls {
  shortfalls: ShortfallGroup[]
  dismissShortfalls: () => void
  system?: UnitSystem
}

export interface TodayShortfalls {
  groups: ShortfallGroup[]
  dismiss: () => void
  correct: StockCorrectionController
  system: UnitSystem
}

export function useTodayShortfalls(a: FlowShortfalls, b: FlowShortfalls): TodayShortfalls {
  // One group per Cooked meal: a meal Cooked again in the other flow replaces its group (the later flow wins).
  const groups = useMemo(() => {
    const byId = new Map<string, ShortfallGroup>()
    for (const g of [...a.shortfalls, ...b.shortfalls]) byId.set(g.id, g)
    return [...byId.values()]
  }, [a.shortfalls, b.shortfalls])
  const dismissA = a.dismissShortfalls
  const dismissB = b.dismissShortfalls
  const dismiss = useCallback(() => {
    dismissA()
    dismissB()
  }, [dismissA, dismissB])
  const system = a.system ?? b.system ?? 'metric'
  const correct = useStockCorrection(groups, dismiss, system)
  return { groups, dismiss, correct, system }
}
