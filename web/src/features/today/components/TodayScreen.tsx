import type { ReactElement, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CouldntPlanNotice, LeftoversTile, NextMealTile, ToConfirmTile } from '../../plan'
import { SpoiledTile } from '../../stock'
import { useAdvanceStepsDue, useToday, useZeroWasteStreak } from '../hooks/useToday'
import { ShoppingListSeam, useTodayTileData } from '../seams'
import type { TileId } from '../types'
import { TodayView } from './TodayView'
import { AdvanceStepsTile } from './AdvanceStepsTile'
import { StreakTile } from './StreakTile'
import { UseSoonTile } from './UseSoonTile'

/**
 * The Today route: builds one element per tile id from the owning features' components
 * (Planning's NextMealTile, ToConfirmTile, CouldntPlanNotice, LeftoversTile; Stock's
 * SpoiledTile; this feature's AdvanceStepsTile, UseSoonTile, StreakTile) and hands them
 * to TodayView with the layout. Cooking, confirming and "not cooked" open the Plan, where
 * their sheets live.
 */
export function TodayScreen(): ReactElement {
  const navigate = useNavigate()
  const openPlan = () => navigate('/plan')
  const { layout, loading } = useToday()
  const data = useTodayTileData()
  const steps = useAdvanceStepsDue()
  const streak = useZeroWasteStreak()

  const tiles: Partial<Record<TileId, ReactNode>> = {
    nextMeal: <NextMealTile slot={data.nextSlot} onOpen={openPlan} />,
    spoiled: (
      <SpoiledTile
        lots={data.spoiled}
        today={data.stockToday}
        system={data.system}
        onThrowOut={(id) => void data.throwOut(id)}
        onKeep={(id) => void data.keep(id)}
      />
    ),
    advanceSteps: <AdvanceStepsTile steps={steps.steps} />,
    toConfirm: <ToConfirmTile slots={data.toConfirm} onCooked={openPlan} onNotCooked={openPlan} />,
    couldntPlan: <CouldntPlanNotice slots={data.couldntPlan} />,
    leftovers: <LeftoversTile leftovers={data.leftovers} today={data.planToday} />,
    useSoon: <UseSoonTile items={data.useSoon} />,
    streak: <StreakTile days={streak.days} />,
  }

  return <TodayView layout={layout} loading={loading} tiles={tiles} shopping={<ShoppingListSeam />} onOpenPlan={openPlan} />
}
