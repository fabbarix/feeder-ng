import { useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, EmptyState, Stepper, Tile, useToast } from '../../../ui'
import { useDocumentTitle } from '../../../ui/lib/useDocumentTitle'
import { formatTimer } from '../../../lib/format'
import { useCookFlow } from '../../plan'
import { usePlannedMeal } from '../hooks/usePlannedMeal'
import { useReheat } from '../hooks/useReheat'
import { REHEAT_MAX_SECONDS, REHEAT_MIN_SECONDS, REHEAT_STEP_SECONDS } from '../lib/reheat'
import { cookStrings } from '../strings'
import type { PlannedMeal, SlotKey } from '../../plan/types'
import '../cook.css'

/**
 * The Reheat screen (route /cook/reheat/:date/:slotId/:courseId, chromeless like Cook Mode): a reheating timer for a Planned
 * Meal of that Course served from a Leftover, then Mark as Cooked. Design: docs/dev/design/r12-reheat.md. Renders and wires only.
 */
export function ReheatScreen(): ReactNode {
  const { date = '', slotId = '', courseId = '' } = useParams()
  const navigate = useNavigate()
  // A11Y-01: the chromeless screen names itself ("Reheat · Feeder"); not pinned by a test (choice).
  useDocumentTitle([cookStrings.reheat])
  // The Course's key (the route always names it: /cook/reheat/:date/:slotId/:courseId).
  const key: SlotKey = { date, mealSlotId: Number(slotId), courseId: Number(courseId) }
  const { isLoading, meal, reheatLines } = usePlannedMeal(key)
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

  return <ReheatBody meal={shown} slotKey={key} lines={reheatLines ?? { overline: cookStrings.reheat, meta: '' }} busy={flow.quickBusy !== null} onMarkCooked={() => void markCooked()} onLeave={home} />
}

interface ReheatBodyProps {
  meal: PlannedMeal
  slotKey: SlotKey
  lines: { overline: string; meta: string }
  busy: boolean
  onMarkCooked: () => void
  onLeave: () => void
}

/**
 * The loaded screen; mounted only once the meal is known, so the default time comes from its portions. PC-15: the h1 is "Reheat";
 * the tile is the overline "Leftover from Mon Dinner", the Recipe, its meta, then one lg Stepper "Reheat time" before a timer exists
 * (the time as a timer once it does) and the tile's one action. Exactly one primary in every state: Start timer, then Pause (Resume
 * when paused), then the footer's Mark as Cooked once the timer has finished, when Restart (secondary) replaces Start timer.
 */
function ReheatBody({ meal, slotKey: key, lines, busy, onMarkCooked, onLeave: home }: ReheatBodyProps): ReactNode {
  const toast = useToast()
  const reheat = useReheat(key, meal.portions, meal.reheatMinutes, () => toast.show(cookStrings.reheatError, { status: 'error' }))
  const { timer, finished } = reheat

  return (
    <div className="cook-screen reheat-screen">
      <div className="cook-top">
        <Button variant="secondary" size="md" icon="exit" onClick={home}>
          {cookStrings.exit}
        </Button>
      </div>
      <header className="cook-screen__header">
        <h1 className="cook-screen__title">{cookStrings.reheat}</h1>
      </header>
      <Tile as="section" variant="surface" span="full" overline={lines.overline} overlineIcon="reheat" className="reheat-tile" aria-label={meal.recipeName}>
        <h2 className="reheat-name">{meal.recipeName}</h2>
        <p className="reheat-meta">{lines.meta}</p>
        {timer ? (
          <p className="reheat-time" role="timer" aria-label={cookStrings.reheat}>
            {formatTimer(reheat.secondsLeft)}
          </p>
        ) : (
          <Stepper
            size="lg"
            label={cookStrings.reheatTime}
            value={reheat.durationSeconds}
            min={REHEAT_MIN_SECONDS}
            max={REHEAT_MAX_SECONDS}
            step={REHEAT_STEP_SECONDS}
            format={formatTimer}
            decreaseLabel={cookStrings.remove30}
            increaseLabel={cookStrings.add30}
            onChange={(next) => reheat.adjust(next - reheat.durationSeconds)}
          />
        )}
        {finished ? (
          <p className="reheat-status" role="status">
            {cookStrings.timerFinished(timer!.label)}
          </p>
        ) : null}
        <div className="reheat-actions">
          {!timer ? (
            <Button variant="primary" icon="timer" size="lg" block="always" loading={reheat.starting} onClick={() => void reheat.start()}>
              {cookStrings.startTimer}
            </Button>
          ) : finished ? (
            <Button variant="secondary" icon="regenerate" size="lg" block="always" loading={reheat.starting} onClick={() => void reheat.restart()}>
              {cookStrings.restart}
            </Button>
          ) : (
            <>
              {timer.state === 'paused' ? (
                <Button variant="primary" icon="resume" size="lg" block="always" onClick={() => void reheat.resume()}>
                  {cookStrings.resume}
                </Button>
              ) : (
                <Button variant="primary" icon="pause" size="lg" block="always" onClick={() => void reheat.pause()}>
                  {cookStrings.pause}
                </Button>
              )}
              <Button variant="secondary" size="lg" block="always" onClick={() => void reheat.cancel()}>
                {cookStrings.cancelTimer}
              </Button>
            </>
          )}
        </div>
      </Tile>
      <div className="reheat-foot">
        <Button variant={finished ? 'primary' : 'secondary'} icon="markCooked" size="lg" block="always" disabled={busy} onClick={onMarkCooked}>
          {cookStrings.markAsCooked}
        </Button>
      </div>
    </div>
  )
}
