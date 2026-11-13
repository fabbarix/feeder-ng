import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMe } from '../../../app/useMe'
import { BentoGrid, Button, EmptyState, ErrorState, PageHeader } from '../../../ui'
import { CookFlowSheets } from '../components/CookFlowSheets'
import { CouldntPlanNotice } from '../components/CouldntPlanNotice'
import { DayTile } from '../components/DayTile'
import { AllCookedSheets } from '../components/AllCookedSheets'
import { PlannedMealSheet } from '../components/PlannedMealSheet'
import { PlanGrid } from '../components/PlanGrid'
import { PlanLeftovers } from '../components/PlanLeftovers'
import { LeftoverSheets } from '../../../ui/LeftoverActions/LeftoverSheets'
import { RecipeChooserSheet } from '../components/RecipeChooserSheet'
import { SlotDateSheets } from '../components/SlotDateSheets'
import { SwapSheet } from '../components/SwapSheet'
import { useCouldntFix } from '../hooks/useCouldntFix'
import { useCouldntPlanNotice } from '../hooks/useCouldntPlanNotice'
import { usePlanDays } from '../hooks/usePlanDays'
import { usePlanScreen } from '../hooks/usePlanScreen'
import { courseCells, unplannedOf } from '../lib/couldntGroups'
import { cookPath } from '../lib/cook'
import { planStrings } from '../strings'
import type { SlotDayKey } from '../types'
import '../plan.css'

/**
 * Route /plan: a week grid of equal day tiles (BentoGrid min="day"; today is marked, not wider). A tap on a Course row
 * opens its Planned Meal sheet; Swap, Pin, Choose a Recipe and the Mark as Cooked flow open their sheets, one at a time.
 * Regenerate asks first. Composition only: the logic lives in hooks/ and lib/.
 */
export function PlanScreen(): ReactNode {
  const s = usePlanScreen()
  const navigate = useNavigate()
  const { plan, actions, flow } = s
  const { days, range } = usePlanDays(plan.slots, plan.today)
  const cookMeal = (key: SlotDayKey) => navigate(cookPath(key))
  const unplanned = useMemo(() => unplannedOf(courseCells(plan.slots)), [plan.slots])
  const isAdmin = useMe().data?.isAdmin !== false
  const notice = useCouldntPlanNotice(unplanned, courseCells(plan.slots), isAdmin)
  const fix = useCouldntFix(s.openChoose)

  let body: ReactNode
  if (plan.isLoading) body = <p className="plan__muted">{planStrings.loading}</p>
  else if (plan.failed) body = <ErrorState message={planStrings.loadError} onRetry={() => void plan.refetch()} />
  else if (days.length === 0) body = <EmptyState title={planStrings.empty} />
  else
    body = (
      <PlanGrid>
        {days.map((day) => (
          <DayTile
            key={day.date}
            day={day}
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
        ))}
      </PlanGrid>
    )

  return (
    <div className="plan">
      {plan.isLoading ? null : (
        <PageHeader
          title={planStrings.title}
          subtitle={range}
          actions={
            <Button variant="secondary" size="sm" icon="regenerate" loading={actions.regenerating || s.regeneratePreviewing} onClick={() => void s.askRegenerate()}>
              {planStrings.regenerate}
            </Button>
          }
        />
      )}
      {plan.updating ? <p className="plan__note">{planStrings.updating}</p> : null}
      {actions.error ? (
        <p role="alert" className="plan__error">
          {actions.error}
        </p>
      ) : null}
      <CookFlowSheets flow={flow} />
      {plan.isLoading || plan.failed || notice.groups.length === 0 ? null : (
        <BentoGrid min="wide" label={planStrings.couldntPlanTitle}>
          <CouldntPlanNotice groups={notice.groups} onFix={fix} span="full" />
        </BentoGrid>
      )}
      <PlanLeftovers flow={s.leftovers} />
      {body}
      {s.plannedCourseId !== undefined ? (
        <PlannedMealSheet
          open={s.plannedOpen}
          onClose={s.closePlanned}
          slot={s.plannedSlot}
          today={plan.today}
          courseId={s.plannedCourseId}
          onMarkRecipes={(courseId) => s.fromSheet(() => navigate(`/recipes?notCourse=${courseId}`))}
          onAddRecipes={() => s.fromSheet(() => navigate('/recipes'))}
          onReviewVarietyRules={() => s.fromSheet(() => navigate('/settings/planning'))}
          onCook={(k) => s.fromSheet(() => cookMeal(k))}
          onMarkCooked={(k) => s.fromSheet(() => flow.open(k))}
          onSwap={(k) => s.fromSheet(() => s.openSwap(k))}
          onPin={(k) => s.fromSheet(() => void actions.pin(k))}
          onUnpin={(k) => s.fromSheet(() => void actions.unpin(k))}
          onChoose={(k) => s.fromSheet(() => s.openChoose(k))}
          onOpenLeftover={(id) => s.fromSheet(() => s.leftovers.openDetails(id))}
        />
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
      />
      <RecipeChooserSheet
        open={s.chooseOpen}
        onClose={s.closeChoose}
        recipes={s.choices.recipes}
        isLoading={s.choices.isLoading}
        onPick={(id) => void s.pickRecipe(id)}
        frozenLeftovers={s.leftovers.leftovers}
        onPickLeftover={(id) => void s.pickLeftover(id)}
      />
    </div>
  )
}
