import { useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMe } from '../../../app/useMe'
import { BentoGrid, Button, EmptyState, ErrorState, LoadState, PageHeader } from '../../../ui'
import { PlanSkeleton } from '../components/PlanSkeleton'
import { CookFlowSheets } from '../components/CookFlowSheets'
import { CouldntMealsSheet } from '../components/CouldntMealsSheet'
import { CouldntPlanNotice } from '../components/CouldntPlanNotice'
import { MarkCourseRecipesSheet } from '../components/MarkCourseRecipesSheet'
import { DayTile } from '../components/DayTile'
import { AllCookedSheets } from '../components/AllCookedSheets'
import { PlannedMealSheet } from '../components/PlannedMealSheet'
import { ReplanReviewSheet } from '../components/ReplanReviewSheet'
import { PlanGrid } from '../components/PlanGrid'
import { PlanLeftovers } from '../components/PlanLeftovers'
import { LeftoverSheets } from '../../../ui/LeftoverActions/LeftoverSheets'
import { RecipeChooserSheet } from '../components/RecipeChooserSheet'
import { SlotDateSheets } from '../components/SlotDateSheets'
import { SwapSheet } from '../components/SwapSheet'
import { useCouldntFix } from '../hooks/useCouldntFix'
import { useCouldntPlanNotice } from '../hooks/useCouldntPlanNotice'
import { usePlanDays } from '../hooks/usePlanDays'
import { usePlanFixSheets } from '../hooks/usePlanFixSheets'
import { useReviewFocusReturn } from '../hooks/useReviewFocusReturn'
import { usePlanScreen } from '../hooks/usePlanScreen'
import { ReplanMarksContext } from '../hooks/useReplanReview'
import { courseCells, unplannedOf } from '../lib/couldntGroups'
import { cookLinkFor } from '../lib/cook'
import { planStrings } from '../strings'
import type { SlotDayKey } from '../types'
import '../plan.css'

/**
 * Route /plan: the week grid (PC-11: up to 4 columns, an incomplete last row shared by its days; today is marked, not wider),
 * under one BentoGrid min="wide" holding Couldn't plan and Leftovers to use (PC-07). A tap on a Course row
 * opens its Planned Meal sheet; Swap, Pin, Choose a Recipe and the Mark as Cooked flow open their sheets, one at a time.
 * Regenerate asks first. Composition only: the logic lives in hooks/ and lib/.
 */
export function PlanScreen(): ReactNode {
  const s = usePlanScreen()
  const navigate = useNavigate()
  const { plan, actions, flow } = s
  const { days, range } = usePlanDays(plan.slots, plan.today)
  const location = useLocation()
  // B9-45 (PC-02): Cook Mode returns to the Plan, at the week the User was on
  const cookMeal = (key: SlotDayKey) => {
    const link = cookLinkFor(key, `/plan${location.search}`)
    navigate(link.to, { state: link.state })
  }
  const cells = useMemo(() => courseCells(plan.slots), [plan.slots])
  const unplanned = useMemo(() => unplannedOf(cells), [cells])
  const isAdmin = useMe().data?.isAdmin !== false
  const notice = useCouldntPlanNotice(unplanned, cells, isAdmin)
  // B9-32 (PC-07): Show which meals and Mark Recipes as <Course> open their sheets here; the Plan is never left.
  const fixSheets = usePlanFixSheets(cells)
  const fix = useCouldntFix(s.openChoose, fixSheets.openMark)
  // B9-32 (B9-26 hand-back): closing What changed puts focus back on the edited row.
  useReviewFocusReturn(s.review.open)
  const showNotice = !(plan.isLoading || plan.failed) && notice.groups.length > 0

  // B9-20 (RES-02): one state model; offline with nothing loaded is a LoadState, never an error or an empty plan.
  let body: ReactNode
  // w4d review (CLS): the skeleton holds until the plan and the Leftovers are in (usePlanScreen topReady), so nothing pushes it down.
  if (!s.topReady) body = <PlanSkeleton label={planStrings.loading} />
  else if (plan.state === 'offlineUnknown')
    body = <LoadState title={planStrings.offlineUnknownTitle} text={planStrings.offlineUnknownText} />
  else if (plan.state === 'failed') body = <ErrorState message={planStrings.loadError} onRetry={() => void plan.refetch()} />
  else if (days.length === 0) body = <EmptyState title={planStrings.empty} />
  else
    body = (
      <PlanGrid count={days.length}>
        {(layout) =>
          days.map((day, i) => (
            <DayTile
              key={day.date}
              day={day}
              span={layout.spans[i]}
              wholeRow={layout.rows[i]}
              today={plan.today}
              onOpen={(k) => s.openPlanned(k)}
              onSwap={(k) => s.openSwap(k)}
              onPin={(k) => void actions.pin(k)}
              onUnpin={(k) => void actions.unpin(k)}
              onChoose={(k) => s.openChoose(k)}
              onCook={cookMeal}
              onMarkAllCooked={(k) => s.openAllCooked(k)}
              onNotCookedSlot={(k) => void actions.notCookedSlot(k)}
              onAddCourse={(k) => s.openChoose(k)}
              dateActions={s.slotDate.actions}
            />
          ))
        }
      </PlanGrid>
    )

  return (
    <div className="plan">
      {/* B9-20: the header is there from the first frame; while loading, an empty subtitle line holds the week's place. */}
      <PageHeader
        title={planStrings.title}
        subtitle={plan.state === 'loading' ? '\u00a0' : range}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon="regenerate"
            loading={actions.regenerating || s.regeneratePreviewing}
            disabled={s.offline}
            onClick={() => void s.askRegenerate()}
          >
            {planStrings.regenerate}
          </Button>
        }
      />
      {plan.updating ? <p className="plan__note">{planStrings.updating}</p> : null}
      {actions.error ? (
        <p role="alert" className="plan__error">
          {actions.error}
        </p>
      ) : null}
      <CookFlowSheets flow={flow} />
      {/* PC-07: Couldn't plan and Leftovers to use share one grid, two-up from 1024 and stacked below. */}
      {s.topReady ? (
        <div className="plan-top">
          <BentoGrid min="wide">
            {showNotice ? <CouldntPlanNotice groups={notice.groups} onFix={fix} onShowMeals={fixSheets.openMeals} /> : null}
            <PlanLeftovers flow={s.leftovers} />
          </BentoGrid>
        </div>
      ) : null}
      {/* B9-26 (PC-01): the rows the last edit changed read their "was ..." mark from here. */}
      <ReplanMarksContext.Provider value={s.review.marks}>{body}</ReplanMarksContext.Provider>
      {s.plannedCourseId !== undefined ? (
        <PlannedMealSheet
          open={s.plannedOpen}
          onClose={s.closePlanned}
          slot={s.plannedSlot}
          today={plan.today}
          courseId={s.plannedCourseId}
          onMarkRecipes={(courseId) => s.fromSheet(() => fixSheets.openMarkById(courseId))}
          onAddRecipes={() => s.fromSheet(() => navigate('/recipes'))}
          onReviewVarietyRules={() => s.fromSheet(() => navigate('/settings/planning'))}
          onCook={(k) => s.fromSheet(() => cookMeal(k))}
          onMarkCooked={(k) => s.fromSheet(() => flow.open(k))}
          onSwap={(k) => s.fromSheet(() => s.openSwap(k))}
          onPin={(k) => s.fromSheet(() => void actions.pin(k))}
          onUnpin={(k) => s.fromSheet(() => void actions.unpin(k))}
          onChoose={(k) => s.fromSheet(() => s.openChoose(k))}
          onOpenLeftover={(id) => s.fromSheet(() => s.leftovers.openDetails(id))}
          timeZone={s.timeZone}
          offline={s.offline}
          onUndoCooked={s.resolvedUndo.onUndoCooked}
          onUndoNotCooked={s.resolvedUndo.onUndoNotCooked}
          onCookedAfterAll={s.resolvedUndo.onCookedAfterAll}
          onNotCooked={s.notCookedFromSheet}
          leftover={s.plannedLeftover}
          onLeftoverAction={s.leftoverAction}
        />
      ) : null}
      <ReplanReviewSheet controller={s.review} />
      <CouldntMealsSheet
        open={fixSheets.mealsOpen}
        onClose={fixSheets.closeMeals}
        groups={notice.groups}
        onChoose={(k) => {
          fixSheets.closeMeals()
          s.openChoose(k)
        }}
      />
      {fixSheets.mark ? (
        <MarkCourseRecipesSheet open onClose={fixSheets.closeMark} course={fixSheets.mark.course} count={fixSheets.mark.count} />
      ) : null}
      <LeftoverSheets flow={s.leftovers} />
      <AllCookedSheets flow={s.allCooked} />
      <SlotDateSheets controller={s.slotDate} />
      <SwapSheet
        open={s.swapOpen}
        onClose={s.closeSwap}
        slot={s.swapSlot}
        alternatives={s.alternatives.alternatives}
        isLoading={s.alternatives.isLoading}
        onPick={(id) => void s.pickAlternative(id)}
        bought={s.swapBought}
        courseId={s.swapCourseId}
      />
      <RecipeChooserSheet
        open={s.chooseOpen}
        onClose={s.closeChoose}
        recipes={s.choices.recipes}
        isLoading={s.choices.isLoading}
        onPick={(id) => void s.pickRecipe(id)}
        frozenLeftovers={s.leftovers.leftovers}
        onPickLeftover={(id) => void s.pickLeftover(id)}
        slot={s.chooseSlot}
        courseId={s.chooseCourseId}
        onPickOther={(id) => void s.pickOtherRecipe(id)}
      />
    </div>
  )
}
