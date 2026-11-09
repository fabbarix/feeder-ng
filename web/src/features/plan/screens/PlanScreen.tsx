import type { ReactNode } from 'react'
import { BentoGrid, Button, EmptyState } from '../../../ui'
import { DayTile } from '../components/DayTile'
import { MarkCookedSheet } from '../components/MarkCookedSheet'
import { RecipeChooserSheet } from '../components/RecipeChooserSheet'
import { ShortfallNotice } from '../components/ShortfallNotice'
import { StockCorrectionSheet } from '../components/StockCorrectionSheet'
import { SwapSheet } from '../components/SwapSheet'
import { usePlanScreen } from '../hooks/usePlanScreen'
import { groupByDay } from '../lib/days'
import { planStrings } from '../strings'
import '../plan.css'

/**
 * Route /plan. A BentoGrid of two columns: a DayTile per day, today spanning both. Swap opens the SwapSheet, Mark as
 * Cooked the MarkCookedSheet (then ShortfallNotice and StockCorrectionSheet), an empty slot offers a Recipe to set.
 * "Regenerate" redoes the unpinned meals; a small note shows while the planner is updating. Composition only: the
 * logic lives in hooks/ and lib/.
 */
export function PlanScreen(): ReactNode {
  const s = usePlanScreen()
  const { plan, actions, cook, stock } = s
  const days = groupByDay(plan.slots, plan.today)

  let body: ReactNode
  if (plan.isLoading) body = <p className="plan__muted">{planStrings.loading}</p>
  else if (plan.error)
    body = (
      <p role="alert" className="plan__error">
        {planStrings.loadError}
      </p>
    )
  else if (days.length === 0) body = <EmptyState title={planStrings.empty} />
  else
    body = (
      <BentoGrid columns={2} label={planStrings.title}>
        {days.map((day) => (
          <DayTile
            key={day.date}
            day={day}
            onSwap={s.openSwap}
            onChoose={s.openChoose}
            onConfirm={(k) => void actions.confirm(k)}
            onUnpin={(k) => void actions.unpin(k)}
            onMarkCooked={s.openCook}
          />
        ))}
      </BentoGrid>
    )

  return (
    <div className="plan">
      <div className="plan__head">
        <h1 className="plan__title">{planStrings.title}</h1>
        <Button variant="tonal" loading={actions.regenerating} onClick={() => void actions.regenerate()} title={planStrings.regenerateHelp}>
          {planStrings.regenerate}
        </Button>
      </div>
      {plan.updating ? (
        <p role="status" className="plan__note">
          {planStrings.updating}
        </p>
      ) : null}
      {actions.error ? (
        <p role="alert" className="plan__error">
          {actions.error}
        </p>
      ) : null}
      {cook.warnings.map((w) => (
        <ShortfallNotice key={w.ingredientId} warning={w} onCorrect={stock.open} onDismiss={(x) => cook.dismissWarning(x.ingredientId)} />
      ))}
      {body}
      <SwapSheet
        open={s.swapOpen}
        onClose={s.closeSwap}
        slot={s.swapSlot}
        alternatives={s.alternatives.alternatives}
        isLoading={s.alternatives.isLoading}
        onPick={(id) => void s.pickAlternative(id)}
      />
      <RecipeChooserSheet
        open={s.chooseOpen}
        onClose={s.closeChoose}
        recipes={s.choices.recipes}
        isLoading={s.choices.isLoading}
        onPick={(id) => void s.pickRecipe(id)}
      />
      <MarkCookedSheet
        open={s.cookOpen}
        onClose={s.closeCook}
        preview={cook.preview}
        isLoading={cook.isLoading}
        leftover={cook.leftover}
        onLeftoverChange={cook.setLeftover}
        onConfirm={() => void s.confirmCooked()}
        onNotCooked={() => void s.skipCooked()}
        busy={cook.busy}
        error={cook.error}
      />
      <StockCorrectionSheet
        open={stock.correction !== null}
        onClose={stock.close}
        correction={stock.correction}
        onSave={(t) => void stock.save(t)}
        busy={stock.busy}
        error={stock.error}
      />
    </div>
  )
}
