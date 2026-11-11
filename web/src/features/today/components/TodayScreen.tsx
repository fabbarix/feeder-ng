import type { ReactElement, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMe } from '../../../app/useMe'
import { useToast } from '../../../ui'
import { CookFlowSheets, CouldntPlanNotice, LeftoversTile, TonightHero, ToConfirmTile, cookPath, useCookFlow, useCouldntFix, useCouldntPlanNotice, useNotCooked } from '../../plan'
import type { SlotKey } from '../../plan/types'
import { cookReheatPath } from '../../cook'
import { SpoiledTile } from '../../stock'
import { useSetupChecklist } from '../hooks/useSetupChecklist'
import { useAdvanceStepsDue, useToday, useZeroWasteStreak } from '../hooks/useToday'
import { localDate } from '../lib/dates'
import { todayHeading } from '../lib/heading'
import { ShoppingListSeam, useTodayTileData } from '../seams'
import { todayStrings } from '../strings'
import type { TileId } from '../types'
import { AdvanceStepsTile } from './AdvanceStepsTile'
import { SetupChecklistTile } from './SetupChecklistTile'
import { StreakTile } from './StreakTile'
import { TodayView } from './TodayView'
import { UseSoonTile } from './UseSoonTile'

/**
 * The Today route: builds one element per tile id from the owning features' components (Plan's TonightHero,
 * ToConfirmTile, CouldntPlanNotice, LeftoversTile and the Mark as Cooked flow; Stock's SpoiledTile; this feature's
 * AdvanceStepsTile, UseSoonTile, StreakTile) and hands them to TodayView with the layout. Cooking, Yes, Cooked and
 * Adjust happen right here; the Leftovers tile opens the Plan.
 */
export function TodayScreen(): ReactElement {
  const navigate = useNavigate()
  const openPlan = () => navigate('/plan')
  const toast = useToast()
  // A failed throw out or keep is shown, never swallowed.
  const act = (run: () => Promise<void>) => {
    run().catch(() => toast.show(todayStrings.actionFailed))
  }
  const { layout, loading, retry } = useToday()
  const data = useTodayTileData()
  const steps = useAdvanceStepsDue()
  const streak = useZeroWasteStreak()
  const flow = useCookFlow()
  const notCooked = useNotCooked()
  const isAdmin = useMe().data?.isAdmin !== false
  const notice = useCouldntPlanNotice(data.couldntPlan, data.planSlots ?? data.couldntPlan, isAdmin)
  const fixCouldnt = useCouldntFix()
  const setup = useSetupChecklist()
  const cookMeal = (key: SlotKey) => navigate(cookPath(key))
  const reheatMeal = (key: SlotKey) => navigate(cookReheatPath(key))
  const yesCooked = (key: SlotKey) => void flow.quickCook(key)

  const hero = data.nextSlot
  const tiles: Partial<Record<TileId, ReactNode>> = {
    nextMeal: hero ? (
      <TonightHero slot={hero} now={data.now} day={data.nextDay} action={data.nextAction} onCook={cookMeal} onYesCooked={yesCooked} onReheat={reheatMeal} onAdjust={flow.open} busy={flow.quickBusy !== null} />
    ) : null,
    spoiled: (
      <SpoiledTile
        lots={data.spoiled}
        today={data.stockToday}
        system={data.system}
        onThrowOut={(id) => act(() => data.throwOut(id))}
        onKeep={(id) => act(() => data.keep(id))}
      />
    ),
    advanceSteps: <AdvanceStepsTile steps={steps.steps} />,
    toConfirm: <ToConfirmTile slots={data.toConfirm} onYesCooked={yesCooked} onAdjust={flow.open} onNotCooked={(key) => void notCooked(key)} />,
    couldntPlan: <CouldntPlanNotice groups={notice.groups} onFix={fixCouldnt} span="full" />,
    setup: <SetupChecklistTile checklist={setup.checklist} onAction={setup.goTo} isAdmin={isAdmin} />,
    leftovers: <LeftoversTile leftovers={data.leftovers} today={data.planToday} onOpen={openPlan} />,
    useSoon: <UseSoonTile items={data.useSoon} />,
    streak: <StreakTile days={streak.days} />,
  }

  return (
    <>
      <TodayView
        layout={layout}
        loading={loading}
        dateLabel={todayHeading(data.planToday || localDate(data.now))}
        onRetry={retry}
        tiles={tiles}
        shopping={<ShoppingListSeam />}
        onOpenPlan={openPlan}
      />
      {layout.mode === 'today' ? <CookFlowSheets flow={flow} /> : null}
    </>
  )
}
