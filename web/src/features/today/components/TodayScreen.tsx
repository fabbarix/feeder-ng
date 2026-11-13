import type { ReactElement, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMe } from '../../../app/useMe'
import { Tile, useToast } from '../../../ui'
import { LeftoverSheets } from '../../../ui/LeftoverActions/LeftoverSheets'
import { useLeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import {
  AllCookedSheets,
  CookFlowSheets,
  CouldntPlanNotice,
  LeftoversTile,
  NotServedRow,
  PlannedMealSheet,
  RecipeChooserSheet,
  SlotDateSheets,
  SwapSheet,
  TonightHero,
  ToConfirmTile,
  cookPath,
  useCookFlow,
  useCouldntFix,
  useCouldntPlanNotice,
  toConfirmCourses,
  useNotCooked,
  usePickLeftover,
  useSlotDate,
  useTonightSheets,
} from '../../plan'
import type { SlotDayKey, SlotKey } from '../../plan/types'
import { cookReheatPath } from '../../cook'
import { SpoiledTile } from '../../stock'
import { useSetupChecklist } from '../hooks/useSetupChecklist'
import { useAdvanceStepsDue, useToday, useZeroWasteStreak } from '../hooks/useToday'
import { localDate } from '../lib/dates'
import { todayHeading } from '../lib/heading'
import { ShoppingListSeam, useTodayTileData } from '../seams'
import { todayStrings } from '../strings'
import type { TileId } from '../types'
import { courseCells } from '../../plan/lib/couldntGroups'
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
  const notice = useCouldntPlanNotice(data.couldntPlan, courseCells(data.planSlots ?? []), isAdmin)
  const fixCouldnt = useCouldntFix()
  const setup = useSetupChecklist()
  const leftovers = useLeftoverFlow(data.planToday)
  const pickLeftover = usePickLeftover()
  const cookMeal = (key: SlotDayKey) => navigate(cookPath(key))
  const reheatMeal = (key: SlotKey) => navigate(cookReheatPath(key))
  const yesCooked = (key: SlotKey) => void flow.quickCook(key)
  const hero = data.nextSlot
  const sheets = useTonightSheets(hero)
  // B5-F1: the per-date choices of today's Tonight slot and its Not served rows (their sheets are rendered below).
  const notServed = data.notServedToday ?? []
  const slotDate = useSlotDate(hero ? [hero, ...notServed] : notServed)

  const tiles: Partial<Record<TileId, ReactNode>> = {
    nextMeal: hero ? (
      <TonightHero
        slot={hero}
        dateActions={slotDate.actions}
        now={data.now}
        day={data.nextDay}
        action={data.nextAction}
        today={data.planToday}
        onCook={cookMeal}
        onYesCooked={yesCooked}
        onReheat={reheatMeal}
        onAdjust={flow.open}
        busy={flow.quickBusy !== null}
        rowHandlers={{
          onOpen: sheets.planned.open,
          onSwap: sheets.swap.open,
          onPin: (k) => void sheets.actions.pin(k),
          onUnpin: (k) => void sheets.actions.unpin(k),
          onMarkCooked: flow.open,
          onChoose: sheets.choose.open,
        }}
        onMarkAllCooked={sheets.openAllCooked}
        menu={{ onNotCookedSlot: (k) => void sheets.actions.notCookedSlot(k), onAddCourse: sheets.choose.open }}
      />
    ) : notServed.length > 0 ? (
      <Tile as="section" variant="surface" span="full">
        {notServed.map((slot) => (
          <NotServedRow key={slot.mealSlotId} slot={slot} offline={slotDate.actions.offline} onPlanAgain={slotDate.actions.onPlanAgain} />
        ))}
      </Tile>
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
    toConfirm: (
      <ToConfirmTile
        slots={data.toConfirm}
        onYesCooked={yesCooked}
        onAdjust={flow.open}
        onNotCooked={(key) => void notCooked(key)}
        onMarkAllCooked={(key) => sheets.allCooked.open(key, toConfirmCourses(data.toConfirm, key))}
      />
    ),
    couldntPlan: <CouldntPlanNotice groups={notice.groups} onFix={fixCouldnt} span="full" />,
    setup: <SetupChecklistTile checklist={setup.checklist} onAction={setup.goTo} isAdmin={isAdmin} />,
    leftovers: <LeftoversTile leftovers={data.leftovers} today={data.planToday} onOpen={openPlan} flow={leftovers} />,
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
      {sheets.planned.courseId !== undefined ? (
        <PlannedMealSheet
          open={sheets.planned.key !== null}
          onClose={sheets.planned.close}
          slot={sheets.planned.slot}
          today={data.planToday}
          courseId={sheets.planned.courseId}
          onCook={cookMeal}
          onMarkCooked={(k) => {
            sheets.planned.close()
            flow.open(k)
          }}
          onSwap={(k) => {
            sheets.planned.close()
            sheets.swap.open(k)
          }}
          onPin={(k) => void sheets.actions.pin(k)}
          onUnpin={(k) => void sheets.actions.unpin(k)}
          onChoose={(k) => {
            sheets.planned.close()
            sheets.choose.open(k)
          }}
          onMarkRecipes={sheets.planned.markRecipes}
          onAddRecipes={sheets.planned.addRecipes}
          onReviewVarietyRules={sheets.planned.reviewVarietyRules}
          onOpenLeftover={(id) => {
            sheets.planned.close()
            leftovers.openDetails(id)
          }}
        />
      ) : null}
      <SwapSheet
        open={sheets.swap.key !== null}
        onClose={sheets.swap.close}
        slot={sheets.swap.slot}
        alternatives={sheets.swap.alternatives}
        isLoading={sheets.swap.isLoading}
        onPick={(id) => void sheets.swap.pick(id)}
        bought={sheets.swap.bought}
      />
      <RecipeChooserSheet
        open={sheets.choose.key !== null}
        onClose={sheets.choose.close}
        recipes={sheets.choose.recipes}
        isLoading={sheets.choose.isLoading}
        onPick={(id) => void sheets.choose.pick(id)}
        frozenLeftovers={leftovers.leftovers}
        onPickLeftover={(id) => {
          const key = sheets.choose.key
          const picked = leftovers.leftovers.find((l) => l.id === id)
          sheets.choose.close()
          if (key && picked) void pickLeftover(key, picked)
        }}
      />
      <LeftoverSheets flow={leftovers} />
      <AllCookedSheets flow={sheets.allCooked} />
      <SlotDateSheets controller={slotDate} />
    </>
  )
}
