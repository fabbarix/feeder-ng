import { useState, type ReactElement, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHouseholdDate } from '../../../app/useHouseholdDate'
import { useMe } from '../../../app/useMe'
import { Tile, useToast } from '../../../ui'
import { LeftoverSheets } from '../../../ui/LeftoverActions/LeftoverSheets'
import {
  AllCookedSheets,
  CookFlowSheets,
  CouldntMealsSheet,
  CouldntPlanNotice,
  LeftoversTile,
  NotServedRow,
  PlannedMealSheet,
  RecipeChooserSheet,
  ReplanReviewSheet,
  SlotDateSheets,
  SwapSheet,
  TonightHero,
  ToConfirmTile,
  ShortfallSheets,
  cookLinkFor,
  useCookFlow,
  useCouldntFix,
  useCouldntPlanNotice,
  useMovedToConfirm,
  usePlanFixSheets,
  toConfirmCourses,
  useNotCooked,
  useScreenLeftovers,
  useSlotDate,
  useTonightSheets,
} from '../../plan'
import type { SlotDayKey, SlotKey } from '../../plan/types'
import { cookReheatPath } from '../../cook'
import { KeepDateSheet, LotSheetHost, SpoiledTile, useSpoiledFlow } from '../../stock'
import type { StockLot } from '../../stock/types'
import { useSetupChecklist } from '../hooks/useSetupChecklist'
import { useAdvanceStepDone } from '../hooks/useAdvanceStepDone'
import { useHouseholdZone } from '../hooks/useHouseholdZone'
import { useMinuteClock } from '../hooks/useMinuteClock'
import { useLayoutMemory } from '../hooks/useLayoutMemory'
import { useTodayShortfalls } from '../hooks/useTodayShortfalls'
import { useAdvanceStepsDue, useToday } from '../hooks/useToday'
import { useTodayMetrics } from '../hooks/useTodayMetrics'
import { todayHeading } from '../lib/heading'
import { rowCounts } from '../lib/layoutMemory'
import { useTodayTileData } from '../seams'
import { useLinesToGet } from '../shopSeam'
import { useShoppingSession } from '../shoppingSeam'
import { todayStrings } from '../strings'
import type { TileId } from '../types'
import { courseCells } from '../../plan/lib/couldntGroups'
import { AdvanceStepsTile } from './AdvanceStepsTile'
import { MetricStrip } from './MetricStrip'
import { SetupChecklistTile } from './SetupChecklistTile'
import { SetupSheets } from './SetupSheets.lazy'
import { ShoppingSessionTile } from './ShoppingSessionTile'
import { TodayView } from './TodayView'
import { UseSoonTile } from './UseSoonTile'

/**
 * The Today route: builds one element per tile id from the owning features' components (Plan's TonightHero, ToConfirmTile,
 * CouldntPlanNotice, LeftoversTile and the Mark as Cooked flows; Stock's SpoiledTile and Lot sheet; this feature's AdvanceStepsTile,
 * UseSoonTile, MetricStrip and ShoppingSessionTile) and hands them to TodayView with the layout. Cooking, Yes, Cooked and Adjust happen
 * right here; Cook Mode comes back to Today (B9-45 `cookLinkFor(key, '/')`). B9-44: Done on an Advance Step with Undo (TB-02); a Use soon
 * row opens its Lot over Today and a Leftover row its actions (TB-11); Throw out or keep? with Undo and Change (SAFE-09, SSP-17); the
 * Shopping tile (TB-12); the remembered shape while the plan loads and the Household date (RES-05); the cook flows' ONE shortfall notice
 * under To confirm (PC-02).
 */
/** Stand-ins while the seam has no spoiled calls (Today then throws out and keeps without Undo). */
const noKeep = (): Promise<StockLot> => Promise.reject(new Error('no spoiled calls'))
const noUndo = (): Promise<void> => Promise.resolve()

export function TodayScreen(): ReactElement {
  const navigate = useNavigate()
  const openPlan = () => navigate('/plan')
  const toast = useToast()
  // A failed throw out or keep is shown, never swallowed.
  const act = (run: () => Promise<void>) => {
    run().catch(() => toast.show(todayStrings.actionFailed))
  }
  const { layout, loading, planLoading, retry } = useToday()
  const data = useTodayTileData()
  const steps = useAdvanceStepsDue()
  const stepDone = useAdvanceStepDone(steps.steps)
  const householdDate = useHouseholdDate()
  const timeZone = useHouseholdZone()
  const shopping = useShoppingSession()
  const lines = useLinesToGet()
  const clock = useMinuteClock(shopping !== null)
  const [openLotId, setOpenLotId] = useState<number | null>(null)
  // SAFE-09, SSP-17: Throw out and Keep act at once, with Undo (and Change for Keep), as on the Pantry.
  const calls = data.spoiledCalls
  const spoiledFlow = useSpoiledFlow({
    system: data.system,
    today: data.stockToday,
    keep: calls?.keep ?? noKeep,
    undoKeep: calls?.undoKeep ?? noUndo,
  })
  const lotOf = (id: number) => data.spoiled.find((l) => l.id === id)
  const metrics = useTodayMetrics(data.leftovers.length, data.leftovers.length > 0)
  const flow = useCookFlow()
  const notCooked = useNotCooked()
  const isAdmin = useMe().data?.isAdmin !== false
  const cells = courseCells(data.planSlots ?? [])
  const notice = useCouldntPlanNotice(data.couldntPlan, cells, isAdmin)
  const fixCouldnt = useCouldntFix()
  // B9-39 (B9-32 question 2): "Show which meals" opens the Couldn't plan sheet over Today (Today is never left).
  const fixSheets = usePlanFixSheets(cells)
  // B9-39 (TB-01): a slot whose time has come joins To confirm; the polite live region says so, and focus stays where it is.
  const announce = useMovedToConfirm(data.justServed ?? [], !data.planLoading)
  const setup = useSetupChecklist()
  // B9-45 (PC-02): Cook Mode returns to where it was opened from.
  const cookMeal = (key: SlotDayKey) => {
    const link = cookLinkFor(key, '/')
    navigate(link.to, { state: link.state })
  }
  const openRecipe = (recipeId: number) => navigate(`/recipes/${recipeId}`)
  const reheatMeal = (key: SlotKey) => navigate(cookReheatPath(key), { state: { from: '/' } })
  const yesCooked = (key: SlotKey) => void flow.quickCook(key)
  const hero = data.nextSlot
  const sheets = useTonightSheets(hero, flow.open)
  // B5-LOW: the Leftover flow, the tile and the chooser's freezer list (round 2: the logic lives in useScreenLeftovers).
  const leftovers = useScreenLeftovers({ today: data.planToday, leftovers: data.leftovers, choose: sheets.choose, closePlanned: sheets.planned.close })
  // B5-F1: the per-date choices of today's Tonight slot and its Not served rows (their sheets are rendered below).
  const notServed = data.notServedToday ?? []
  const slotDate = useSlotDate(hero ? [hero, ...notServed] : notServed)
  // PC-02 (ruling 2): one shortfall notice under To confirm for both cook flows, with one Correct Stock sheet.
  const shortfalls = useTodayShortfalls(flow, sheets.allCooked)
  // RES-05: the shape of this layout is remembered for the next launch, and the last one is drawn while the plan loads.
  const remembered = useLayoutMemory(
    layout,
    rowCounts({ toConfirm: data.toConfirm, advanceSteps: steps.steps.length, leftovers: data.leftovers.length, useSoon: data.useSoon.length, spoiled: data.spoiled.length }),
    !planLoading && !loading,
  )

  // RES-05: the Household's date, never the device's; unknown (first launch ever) is a reserved skeleton.
  const date = data.planToday || householdDate
  const dateLabel = date ? todayHeading(date) : null

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
        onOpenRecipe={openRecipe}
        rowHandlers={{
          // TB-10: a why chip also says `{ section: 'why', reason }`; the Planned Meal sheet (B9-38) does not scroll to it yet.
          onOpen: (k) => sheets.planned.open(k),
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
        onThrowOut={(id) => {
          const lot = lotOf(id)
          if (calls && lot) void spoiledFlow.throwOut(lot, calls)
          else act(() => data.throwOut(id))
        }}
        onKeep={(id) => {
          const lot = lotOf(id)
          if (calls && lot) void spoiledFlow.keep(lot)
          else act(() => data.keep(id))
        }}
      />
    ),
    advanceSteps: (
      <AdvanceStepsTile
        steps={steps.steps}
        today={data.planToday || householdDate || ''}
        timeZone={timeZone ?? 'UTC'}
        offline={stepDone.offline}
        onDone={(step) => void stepDone.markDone(step)}
      />
    ),
    toConfirm: (
      <ToConfirmTile
        slots={data.toConfirm}
        today={data.planToday}
        onYesCooked={yesCooked}
        onAdjust={flow.open}
        onNotCooked={(key) => void notCooked(key)}
        onAllCooked={(slot) => void sheets.allCooked.quickAll(slot, toConfirmCourses(data.toConfirm, slot))}
        onMarkAllCooked={(slot) => sheets.allCooked.open(slot, toConfirmCourses(data.toConfirm, slot))}
        onNotCookedSlot={(slot) => void sheets.actions.notCookedSlot(slot)}
      />
    ),
    couldntPlan: <CouldntPlanNotice groups={notice.groups} onFix={fixCouldnt} onShowMeals={fixSheets.openMeals} span="full" />,
    setup: <SetupChecklistTile checklist={setup.checklist} zoneRows={setup.zoneRows} actions={setup.actions} isAdmin={isAdmin} busy={setup.busy} sheetOpen={setup.sheet !== null} />,
    leftovers: <LeftoversTile leftovers={data.leftovers} today={data.planToday} flow={leftovers.flow} tone={leftovers.tile.tone} />,
    useSoon: <UseSoonTile items={data.useSoon} system={data.system} onOpenLot={setOpenLotId} />,
    shopping: shopping ? (
      <ShoppingSessionTile
        session={shopping}
        linesToGet={lines.count}
        now={clock}
        onBack={() => {
          shopping.resume()
          navigate('/scan')
        }}
        onDone={() => void shopping.end()}
      />
    ) : null,
    // The strip waits for the streak and the Shop list: its numbers are complete when it shows.
    metrics: <MetricStrip metrics={metrics.loading ? [] : metrics.metrics} />,
  }

  return (
    <>
      <TodayView
        layout={layout}
        loading={loading}
        planLoading={planLoading}
        // RES-05: the tiles below the top wait for Today's other reads, so nothing is inserted above a painted tile.
        holding={loading && !planLoading}
        remembered={remembered}
        dateLabel={dateLabel}
        onRetry={retry}
        offlineUnknown={data.offlineUnknown === true}
        announce={announce}
        tiles={tiles}
        notice={
          <ShortfallSheets groups={shortfalls.groups} correct={shortfalls.correct} onDismiss={shortfalls.dismiss} system={shortfalls.system} placement="list" />
        }
        onOpenPlan={openPlan}
      />
      <CookFlowSheets flow={flow} notice={false} />
      <LotSheetHost lotId={openLotId} onClose={() => setOpenLotId(null)} />
      <KeepDateSheet open={spoiledFlow.changing !== null} lot={spoiledFlow.changing} today={data.stockToday} onClose={spoiledFlow.closeChange} onKeep={spoiledFlow.keepUntil} />
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
          onOpenLeftover={(id) => leftovers.openLeftover(id)}
          timeZone={sheets.planned.timeZone}
          offline={sheets.planned.offline}
          onUndoCooked={sheets.planned.resolvedUndo.onUndoCooked}
          onUndoNotCooked={sheets.planned.resolvedUndo.onUndoNotCooked}
          onCookedAfterAll={sheets.planned.resolvedUndo.onCookedAfterAll}
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
        courseId={sheets.swap.courseId}
      />
      <RecipeChooserSheet
        open={sheets.choose.key !== null}
        onClose={sheets.choose.close}
        recipes={sheets.choose.sheetRecipes}
        isLoading={sheets.choose.sheetLoading}
        onPick={(id) => void sheets.choose.pick(id)}
        frozenLeftovers={leftovers.chooserLeftovers}
        onPickLeftover={(id) => void leftovers.pickLeftover(id)}
        slot={sheets.choose.slot}
        courseId={sheets.choose.courseId}
        onPickOther={(id) => void sheets.choose.pickOther(id)}
      />
      <ReplanReviewSheet controller={sheets.review} />
      <CouldntMealsSheet
        open={fixSheets.mealsOpen}
        onClose={fixSheets.closeMeals}
        groups={notice.groups}
        onChoose={(k) => {
          fixSheets.closeMeals()
          sheets.choose.open(k)
        }}
      />
      <LeftoverSheets flow={leftovers.flow} />
      <AllCookedSheets flow={sheets.allCooked} notice={false} />
      <SlotDateSheets controller={slotDate} />
      {/* B9-53 (TB-06): the sheets the setup checklist opens over Today (loaded on demand). */}
      <SetupSheets
        sheet={setup.sheet}
        closeSheet={setup.closeSheet}
        memberCaption={setup.memberCaption}
        sheets={setup.sheets}
        pickZone={setup.pickZone}
        setUpByHand={setup.setUpByHand}
      />
    </>
  )
}
