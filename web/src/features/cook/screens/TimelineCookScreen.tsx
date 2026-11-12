// CRS F (spec 11): Cook Mode on the slot's cooking timeline: All or one Course, the Course menu, Mark all Cooked on the
// last item of All, Mark as Cooked for a Course. The screen stays while other Courses remain.
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  MarkAllCookedSheet,
  MarkCookedSheet,
  ShortfallNotice,
  StockCorrectionSheet,
  useAllCookedFlow,
  useMarkCooked,
  useNotCooked,
  usePlan,
  useStockSheet,
} from '../../plan'
import { mayResolve } from '../../plan/lib/resolve'
import { leftoverOutcomeText } from '../../plan/lib/cook'
import type { SlotKey } from '../../plan/types'
import { createBrowserSpeech } from '../adapters/speech'
import { createWakeLock } from '../adapters/wakeLock'
import { createWebAudioAlarm } from '../adapters/alarm'
import { CookNavTiles } from '../components/CookNavTiles'
import { CookedConfirmation } from '../components/CookedConfirmation'
import { CookTimerStrip } from '../components/CookTimerStrip'
import { CookTopRow } from '../components/CookTopRow'
import { CourseFilterChips } from '../components/CourseFilterChips'
import { CourseMenu } from '../components/CourseMenu'
import { StepTile } from '../components/StepTile'
import { TimelineAdvanceTile } from '../components/TimelineAdvanceTile'
import { useCoachMark } from '../hooks/useCoachMark'
import { useCookTimeline } from '../hooks/useCookTimeline'
import { useFormatUse } from '../hooks/useFormatUse'
import { useMediaQuery, useTimerAlarm, useVoiceCommands, useVoicePreference, useWakeLock } from '../hooks/useDevice'
import { sameScope } from '../lib/scope'
import { filterChips } from '../lib/timeline'
import type { VoiceCommand } from '../lib/voice'
import { cookStrings } from '../strings'
import type { CookTimelineTarget } from '../types'
import { EmptyState, Button } from '../../../ui'
import '../cook.css'

/** The plan key of one Course of the slot; the course-less alias (courseId 0) is the main Course until C3. */
export const courseKeyOf = (target: CookTimelineTarget, courseId: number): SlotKey =>
  courseId ? { date: target.date, mealSlotId: target.mealSlotId, courseId } : { date: target.date, mealSlotId: target.mealSlotId }

export function TimelineCookScreen({ target }: { target: CookTimelineTarget }): ReactNode {
  const navigate = useNavigate()
  const client = useQueryClient()
  const tl = useCookTimeline(target)
  const plan = usePlan()
  const view = tl.view
  const slotKey: SlotKey = { date: target.date, mealSlotId: target.mealSlotId }
  const open = tl.unresolved
  const several = view ? filterChips(view).length > 0 : false
  const allMode = tl.filter === 'all' && open.length >= 2
  const current = tl.item ? open.find((c) => c.courseId === tl.item!.courseId) : undefined

  const [markCourse, setMarkCourse] = useState<number | null>(null)
  const marked = useMarkCooked(markCourse === null ? null : courseKeyOf(target, markCourse))
  const allCooked = useAllCookedFlow()
  const notCooked = useNotCooked()
  const stock = useStockSheet((id) => marked.dismissWarning(id))
  const refreshTimeline = () => void client.invalidateQueries({ queryKey: ['cook', 'view', 'timeline'] })

  const alarm = useMemo(() => createWebAudioAlarm(), [])
  const speech = useMemo(() => createBrowserSpeech(), [])
  const wake = useMemo(() => createWakeLock(), [])
  useWakeLock(wake)
  useTimerAlarm(tl.timers.timers, alarm)
  const [voiceOn, setVoiceOn] = useVoicePreference()
  const tapZones = useMediaQuery('(min-width: 768px)')
  const [coachOn, dismissCoach] = useCoachMark()
  const formatUse = useFormatUse()
  const finish = () => navigate('/')

  const onCommand = (command: VoiceCommand) => {
    if (command === 'next') tl.gate.next()
    else if (command === 'back') tl.back()
    else if (command === 'pauseTimer') {
      const running = tl.timers.items.find((i) => i.timer.state === 'running')
      if (running) void tl.timers.pause(running.timer.id)
    }
  }
  useVoiceCommands({ adapter: speech, enabled: voiceOn, onCommand })

  // Something was Cooked on this screen (one Course or the whole slot). A later refetch may fail (B13): the confirmation
  // still wins over the 409 not_cookable answer, because the Course was cooked before that answer came.
  const cookedAny = marked.result !== null || allCooked.controller.result !== null
  // Skipping the last open Course with nothing Cooked leaves at once, as the old screen did (no "No Steps" page).
  const leaveIfNothingLeft = (skippedLast: boolean) => {
    if (skippedLast && !cookedAny) finish()
    else refreshTimeline()
  }
  const skipCourse = async (courseId: number) => {
    const skipped = await notCooked(courseKeyOf(target, courseId))
    if (skipped) leaveIfNothingLeft(open.length <= 1)
  }
  const afterCook = () => {
    setMarkCourse(null)
    refreshTimeline()
  }

  // Everything marked: the confirmation page. Otherwise the screen stays while other Courses remain.
  const finishedCooking = cookedAny && (tl.notCookable || (view !== undefined && open.length === 0))
  if (finishedCooking) {
    const outcome = marked.outcome
    return (
      <div className="cook-screen">
        <CookedConfirmation recipeName={view?.courses[0]?.recipeName ?? view?.slotName ?? ''} outcomeText={outcome ? leftoverOutcomeText(outcome) : ''} onLeave={finish}>
          {marked.warnings.map((w) => (
            <ShortfallNotice key={w.ingredientId} warning={w} onCorrect={stock.open} onDismiss={(x) => marked.dismissWarning(x.ingredientId)} />
          ))}
          <StockCorrectionSheet
            open={stock.correction !== null}
            onClose={stock.close}
            correction={stock.correction}
            onSave={(t) => void stock.save(t)}
            busy={stock.busy}
            error={stock.error}
          />
        </CookedConfirmation>
      </div>
    )
  }
  if (tl.notCookable) return <EmptyState title={cookStrings.notCookable} action={<Button variant="secondary" onClick={finish}>{cookStrings.back}</Button>} />
  if (tl.error) return <EmptyState title={cookStrings.loadError} />
  if (!view) return <EmptyState title={cookStrings.loading} />

  const title = several ? view.slotName : (view.courses.find((c) => c.state === 'planned')?.recipeName ?? view.slotName)
  const isLast = tl.isLast
  const canMark = mayResolve(target.date, plan.today) && open.length > 0
  const markTarget = allMode ? null : (current?.courseId ?? open[0]?.courseId ?? null)
  const onMarkCooked = isLast && canMark ? () => (allMode ? allCooked.open(slotKey, open.map((c) => c.courseId)) : setMarkCourse(markTarget)) : undefined
  const advanceShown = tl.nav.index === 0 && tl.filter === 'all' ? tl.advance : []

  return (
    <div className="cook-screen">
      <CookTopRow number={tl.step?.number ?? 0} of={tl.step?.of ?? 0} speechSupported={speech.supported} voiceOn={voiceOn} onVoiceChange={setVoiceOn} onExit={finish} />
      <header className="cook-screen__header">
        <h1 className="cook-screen__title">{title}</h1>
        {several ? <CourseMenu entries={tl.courseMenu} onCooked={(c) => setMarkCourse(c)} onNotCooked={(c) => void skipCourse(c)} /> : null}
      </header>
      <CourseFilterChips chips={tl.chips} selected={tl.filter} onSelect={tl.setFilter} />
      <TimelineAdvanceTile groups={advanceShown} onMarkDone={(scope, step) => void tl.markAdvanceDone(scope, step)} />
      {tl.step ? (
        <StepTile
          key={`${tl.item?.courseId}-${tl.step.index}-${tl.step.number}`}
          step={tl.step}
          formatUse={formatUse}
          tapZones={tapZones}
          coachMark={tapZones && coachOn}
          onCoachDismiss={dismissCoach}
          onBack={tl.back}
          onNext={tl.gate.next}
          caption={several ? tl.caption : null}
          clock={several ? tl.clock : null}
        />
      ) : (
        <p className="cook-screen__empty">{cookStrings.noSteps}</p>
      )}
      <CookTimerStrip
        scope={tl.item?.scope ?? ''}
        items={tl.timers.items}
        belongs={(timerScope) => (view ? view.courses.some((c) => sameScope(timerScope, c.scope, tl.mainCourseId)) : false)}
        onPause={(id) => void tl.timers.pause(id)}
        onResume={(id) => void tl.timers.resume(id)}
        onCancel={(id) => void tl.timers.cancel(id)}
      />
      <CookNavTiles
        isFirst={tl.isFirst}
        isLast={isLast}
        onBack={tl.back}
        onNext={tl.gate.next}
        heldText={tl.gate.heldText}
        onMarkCooked={onMarkCooked}
        markLabel={allMode ? cookStrings.markAllCooked : undefined}
      />
      <MarkCookedSheet
        open={markCourse !== null}
        onClose={() => setMarkCourse(null)}
        preview={marked.preview}
        isLoading={marked.isLoading}
        leftover={marked.leftover}
        onLeftoverChange={marked.setLeftover}
        onConfirm={async () => {
          if (await marked.confirm()) afterCook()
        }}
        onNotCooked={async () => {
          if (await marked.notCooked()) {
            setMarkCourse(null)
            if (open.length <= 1 && !cookedAny) finish()
            else refreshTimeline()
          }
        }}
        busy={marked.busy}
        error={marked.error}
      />
      <MarkAllCookedSheet
        open={allCooked.key !== null}
        onClose={allCooked.close}
        rows={allCooked.controller.rows}
        isLoading={allCooked.controller.isLoading}
        onLeftoverChange={allCooked.controller.setLeftover}
        onConfirm={async () => {
          if (await allCooked.confirm()) refreshTimeline()
        }}
        busy={allCooked.controller.busy}
        error={allCooked.controller.error}
      />
    </div>
  )
}
