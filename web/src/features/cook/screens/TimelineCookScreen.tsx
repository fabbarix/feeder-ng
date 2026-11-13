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
import { cookedAllOutcomeText, leftoverOutcomeText } from '../../plan/lib/cook'
import type { SlotDayKey, SlotKey } from '../../plan/types'
import { createBrowserSpeech } from '../adapters/speech'
import { createWakeLock } from '../adapters/wakeLock'
import { createWebAudioAlarm } from '../adapters/alarm'
import { BaseCoveredLines } from '../components/BaseCoveredLines'
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
import {
  allMode as isAllMode,
  canMark as canMarkDate,
  confirmationName,
  filterChips,
  finishedCooking,
  leaveIfNothingLeft,
  markTarget as pickMarkTarget,
  title as headerTitle,
} from '../lib/timeline'
import type { VoiceCommand } from '../lib/voice'
import { cookStrings } from '../strings'
import type { CookTimelineTarget } from '../types'
import { EmptyState, Button } from '../../../ui'
import '../cook.css'

/** The plan key of one Course of the slot (crs-c3: every key names its Course). */
export const courseKeyOf = (target: CookTimelineTarget, courseId: number): SlotKey => ({ date: target.date, mealSlotId: target.mealSlotId, courseId })

export function TimelineCookScreen({ target }: { target: CookTimelineTarget }): ReactNode {
  const navigate = useNavigate()
  const client = useQueryClient()
  const tl = useCookTimeline(target)
  const plan = usePlan()
  const view = tl.view
  const slotKey: SlotDayKey = { date: target.date, mealSlotId: target.mealSlotId }
  const open = tl.unresolved
  const several = view ? filterChips(view).length > 0 : false
  const allModeOn = isAllMode(tl.filter, open)
  const current = tl.item ? open.find((c) => c.courseId === tl.item!.courseId) : undefined

  const [markCourse, setMarkCourse] = useState<number | null>(null)
  // The Courses cooked on this screen, named by the confirmation page (lib/timeline confirmationName).
  const [doneIds, setDoneIds] = useState<number[]>([])
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
  const skipCourse = async (courseId: number) => {
    const skipped = await notCooked(courseKeyOf(target, courseId))
    if (skipped) afterSkip()
  }
  // Skipping the last open Course with nothing Cooked leaves at once, as the old screen did (no "No Steps" page).
  const afterSkip = () => {
    if (leaveIfNothingLeft(open.length, cookedAny) === 'leave') finish()
    else refreshTimeline()
  }
  const afterCook = (courseId: number | null) => {
    setDoneIds(courseId === null ? [] : [courseId])
    setMarkCourse(null)
    refreshTimeline()
  }

  // Everything marked: the confirmation page. Otherwise the screen stays while other Courses remain.
  const finished = finishedCooking({ cookedAny, notCookable: tl.notCookable, loaded: view !== undefined, unresolvedCount: open.length })
  if (finished) {
    // The outcome of the last thing cooked here: the whole slot (Mark all Cooked) or one Course.
    const allDone = allCooked.controller.result !== null
    const allResult = allCooked.controller.result
    const outcomeText = allDone && allResult ? cookedAllOutcomeText(allResult) : marked.outcome ? leftoverOutcomeText(marked.outcome) : ''
    const shortfalls = allDone ? allCooked.warnings : marked.warnings
    const dismissShortfall = allDone ? allCooked.dismissWarning : marked.dismissWarning
    const shortfallStock = allDone ? allCooked.stock : stock
    return (
      <div className="cook-screen">
        <CookedConfirmation recipeName={confirmationName(view, doneIds)} outcomeText={outcomeText} onLeave={finish}>
          {shortfalls.map((w) => (
            <ShortfallNotice key={w.ingredientId} warning={w} onCorrect={shortfallStock.open} onDismiss={(x) => dismissShortfall(x.ingredientId)} />
          ))}
          <StockCorrectionSheet
            open={shortfallStock.correction !== null}
            onClose={shortfallStock.close}
            correction={shortfallStock.correction}
            onSave={(t) => void shortfallStock.save(t)}
            busy={shortfallStock.busy}
            error={shortfallStock.error}
          />
        </CookedConfirmation>
      </div>
    )
  }
  if (tl.notCookable) return <EmptyState title={cookStrings.notCookable} action={<Button variant="secondary" onClick={finish}>{cookStrings.back}</Button>} />
  if (tl.error) return <EmptyState title={cookStrings.loadError} />
  if (!view) return <EmptyState title={cookStrings.loading} />

  const isLast = tl.isLast
  const markable = canMarkDate(target.date, plan.today, open)
  const onMarkCooked =
    isLast && markable
      ? () => (allModeOn ? allCooked.open(slotKey, open.map((c) => c.courseId)) : setMarkCourse(pickMarkTarget(allModeOn, current?.courseId ?? null, open)))
      : undefined
  const advanceShown = tl.nav.index === 0 && tl.filter === 'all' ? tl.advance : []

  return (
    <div className="cook-screen">
      <CookTopRow number={tl.step?.number ?? 0} of={tl.step?.of ?? 0} speechSupported={speech.supported} voiceOn={voiceOn} onVoiceChange={setVoiceOn} onExit={finish} />
      <header className="cook-screen__header">
        <h1 className="cook-screen__title">{headerTitle(view, several)}</h1>
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
          ready={tl.ready}
        />
      ) : (
        <p className="cook-screen__empty">{cookStrings.noSteps}</p>
      )}
      <BaseCoveredLines lines={tl.covered} />
      <CookTimerStrip
        scope={tl.item?.scope ?? ''}
        items={tl.timers.items}
        belongs={(timerScope) => (view ? view.courses.some((c) => sameScope(timerScope, c.scope)) : false)}
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
        markLabel={allModeOn ? cookStrings.markAllCooked : undefined}
      />
      <MarkCookedSheet
        open={markCourse !== null}
        onClose={() => setMarkCourse(null)}
        preview={marked.preview}
        isLoading={marked.isLoading}
        leftover={marked.leftover}
        onLeftoverChange={marked.setLeftover}
        onConfirm={async () => {
          const courseId = markCourse
          if (await marked.confirm()) afterCook(courseId)
        }}
        onNotCooked={async () => {
          if (await marked.notCooked()) {
            setMarkCourse(null)
            afterSkip()
          }
        }}
        busy={marked.busy}
        error={marked.error}
        courseId={marked.courseId}
        usedFrom={marked.usedFrom}
      />
      <MarkAllCookedSheet
        open={allCooked.key !== null}
        onClose={allCooked.close}
        rows={allCooked.controller.rows}
        isLoading={allCooked.controller.isLoading}
        onLeftoverChange={allCooked.controller.setLeftover}
        onConfirm={async () => {
          const ids = open.map((c) => c.courseId)
          if (await allCooked.confirm()) {
            setDoneIds(ids)
            refreshTimeline()
          }
        }}
        busy={allCooked.controller.busy}
        error={allCooked.controller.error}
        usedFrom={allCooked.controller.usedFrom}
      />
    </div>
  )
}
