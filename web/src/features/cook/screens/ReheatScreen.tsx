import { useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, Tile, useToast } from '../../../ui'
import { formatTimer } from '../../../lib/format'
import { useCookFlow } from '../../plan'
import { usePlannedMeal } from '../hooks/usePlannedMeal'
import { useReheat } from '../hooks/useReheat'
import { REHEAT_STEP_SECONDS } from '../lib/reheat'
import { timerActions } from '../lib/timers'
import { cookStrings } from '../strings'
import type { PlannedMeal, SlotKey } from '../../plan/types'
import '../cook.css'

/**
 * The Reheat screen (route /cook/reheat/:date/:slotId, chromeless like Cook Mode): a reheating timer for a Planned
 * Meal served from a Leftover, then Mark as Cooked. The route /cook/reheat/:date/:slotId/:courseId reheats that Course's
 * Planned Meal. Design: docs/dev/design/r12-reheat.md. Renders and wires only.
 */
export function ReheatScreen(): ReactNode {
  const { date = '', slotId = '', courseId = '' } = useParams()
  const navigate = useNavigate()
  // The Course's key (the route always names it: /cook/reheat/:date/:slotId/:courseId).
  const key: SlotKey = { date, mealSlotId: Number(slotId), courseId: Number(courseId) }
  const { isLoading, meal } = usePlannedMeal(key)
  const flow = useCookFlow()
  // After Mark as Cooked the plan refetches and the meal turns Cooked before we leave: hold the last body meanwhile.
  const [leaving, setLeaving] = useState(false)
  const lastMeal = useRef<PlannedMeal | null>(null)
  const home = () => navigate('/')
  const markCooked = async () => {
    setLeaving(true)
    if (await flow.quickCook(key)) home()
    else setLeaving(false)
  }

  if (isLoading) return <EmptyState title={cookStrings.loading} />
  const shown = leaving && lastMeal.current ? lastMeal.current : meal
  if (!shown || shown.state !== 'planned') {
    return <EmptyState title={cookStrings.notCookable} action={<Button variant="secondary" onClick={home}>{cookStrings.back}</Button>} />
  }
  if (!shown.servedFromLeftover) {
    return <EmptyState title={cookStrings.notALeftover} action={<Button variant="secondary" onClick={home}>{cookStrings.back}</Button>} />
  }
  lastMeal.current = shown

  return <ReheatBody meal={shown} slotKey={key} busy={flow.quickBusy !== null} onMarkCooked={() => void markCooked()} onLeave={home} />
}

interface ReheatBodyProps {
  meal: PlannedMeal
  slotKey: SlotKey
  busy: boolean
  onMarkCooked: () => void
  onLeave: () => void
}

/** The loaded screen; mounted only once the meal is known, so the default time comes from its portions. */
function ReheatBody({ meal, slotKey: key, busy, onMarkCooked, onLeave: home }: ReheatBodyProps): ReactNode {
  const toast = useToast()
  const reheat = useReheat(key, meal.portions, meal.reheatMinutes, () => toast.show(cookStrings.reheatError, { status: 'error' }))
  const { timer } = reheat
  const actions = timer ? timerActions(timer.state) : []

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
            {timer.state === 'finished' ? <p role="status">{cookStrings.timerFinished(timer.label)}</p> : null}
            {actions.includes('resume') ? (
              <Button variant="primary" icon="resume" onClick={() => void reheat.resume()}>
                {cookStrings.resume}
              </Button>
            ) : actions.includes('pause') ? (
              <Button variant="primary" icon="pause" onClick={() => void reheat.pause()}>
                {cookStrings.pause}
              </Button>
            ) : null}
            {actions.includes('cancel') ? (
              <Button variant="secondary" onClick={() => void reheat.cancel()}>
                {cookStrings.cancelTimer}
              </Button>
            ) : null}
            {actions.includes('dismiss') ? (
              <Button variant="secondary" onClick={() => void reheat.cancel()}>
                {cookStrings.dismissTimer}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="reheat-actions">
            <Button variant="secondary" onClick={() => reheat.adjust(-REHEAT_STEP_SECONDS)}>
              {cookStrings.remove30}
            </Button>
            <Button variant="secondary" onClick={() => reheat.adjust(REHEAT_STEP_SECONDS)}>
              {cookStrings.add30}
            </Button>
            <Button variant="primary" icon="timer" loading={reheat.starting} onClick={() => void reheat.start()}>
              {cookStrings.startTimer}
            </Button>
          </div>
        )}
      </Tile>
      <Button variant="primary" icon="markCooked" disabled={busy} onClick={onMarkCooked}>
        {cookStrings.markAsCooked}
      </Button>
    </div>
  )
}
