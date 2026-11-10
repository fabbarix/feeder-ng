import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, Tile } from '../../../ui'
import { formatTimer } from '../../../lib/format'
import { useCookFlow, usePlan } from '../../plan'
import { useReheat } from '../hooks/useReheat'
import { REHEAT_STEP_SECONDS } from '../lib/reheat'
import { cookStrings } from '../strings'
import type { PlannedMeal, SlotKey } from '../../plan/types'
import '../cook.css'

/**
 * The Reheat screen (route /cook/reheat/:date/:slotId, chromeless like Cook Mode): a reheating timer for a Planned
 * Meal served from a Leftover, then Mark as Cooked. Design: docs/dev/design/r12-reheat.md. Renders and wires only.
 */
export function ReheatScreen(): ReactNode {
  const { date = '', slotId = '' } = useParams()
  const navigate = useNavigate()
  const plan = usePlan()
  const key: SlotKey = { date, mealSlotId: Number(slotId) }
  const meal = plan.slots.find((x) => x.date === key.date && x.mealSlotId === key.mealSlotId)?.meal ?? null
  const home = () => navigate('/')

  if (plan.isLoading || !plan.view) return <EmptyState title={cookStrings.loading} />
  if (!meal || meal.state !== 'planned') {
    return <EmptyState title={cookStrings.notCookable} action={<Button variant="secondary" onClick={home}>{cookStrings.back}</Button>} />
  }
  if (!meal.servedFromLeftover) {
    return <EmptyState title={cookStrings.notALeftover} action={<Button variant="secondary" onClick={home}>{cookStrings.back}</Button>} />
  }

  return <ReheatBody meal={meal} slotKey={key} onLeave={home} />
}

interface ReheatBodyProps {
  meal: PlannedMeal
  slotKey: SlotKey
  onLeave: () => void
}

/** The loaded screen; mounted only once the meal is known, so the default time comes from its portions. */
function ReheatBody({ meal, slotKey: key, onLeave: home }: ReheatBodyProps): ReactNode {
  const reheat = useReheat(key, meal.portions, meal.reheatMinutes)
  const flow = useCookFlow()
  const { timer } = reheat
  const markCooked = async () => {
    if (await flow.quickCook(key)) home()
  }

  return (
    <div className="cook-screen">
      <div className="cook-top">
        <Button variant="secondary" size="md" icon="exit" onClick={home}>
          {cookStrings.exit}
        </Button>
      </div>
      <header className="cook-screen__header">
        <h1 className="cook-screen__title">{meal.recipeName}</h1>
      </header>
      <Tile variant="soft" overline={cookStrings.reheat} overlineIcon="reheat" className="reheat-tile">
        <p className="reheat-time" role="timer" aria-label={cookStrings.reheat}>
          {formatTimer(timer ? reheat.secondsLeft : reheat.durationSeconds)}
        </p>
        {timer ? (
          <div className="reheat-actions">
            {timer.state === 'paused' ? (
              <Button variant="primary" icon="timer" onClick={() => void reheat.resume()}>
                {cookStrings.resume}
              </Button>
            ) : timer.state === 'running' ? (
              <Button variant="primary" icon="pause" onClick={() => void reheat.pause()}>
                {cookStrings.pause}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => void reheat.cancel()}>
              {cookStrings.cancelTimer}
            </Button>
          </div>
        ) : (
          <div className="reheat-actions">
            <Button variant="secondary" onClick={() => reheat.adjust(-REHEAT_STEP_SECONDS)}>
              {cookStrings.remove30}
            </Button>
            <Button variant="secondary" onClick={() => reheat.adjust(REHEAT_STEP_SECONDS)}>
              {cookStrings.add30}
            </Button>
            <Button variant="primary" icon="timer" onClick={() => void reheat.start()}>
              {cookStrings.startTimer}
            </Button>
          </div>
        )}
      </Tile>
      <Button variant="primary" icon="markCooked" disabled={flow.quickBusy !== null} onClick={() => void markCooked()}>
        {cookStrings.markAsCooked}
      </Button>
    </div>
  )
}
