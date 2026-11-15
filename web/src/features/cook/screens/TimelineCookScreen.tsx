// CRS F (spec 11): Cook Mode on the slot's cooking timeline: All or one Course, the Course menu, Mark all Cooked on the
// last item of All, Mark as Cooked for a Course. The screen stays while other Courses remain.
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { MarkAllCookedSheet, MarkCookedSheet, useAllCookedFlow, useCookFlow, useNotCooked, usePlan } from '../../plan'
import { ShortfallSheets } from '../../plan/components/ShortfallSheets'
import type { PlanSlot, SlotDayKey, SlotKey } from '../../plan/types'
import { createBrowserSpeech } from '../adapters/speech'
import { createWakeLock } from '../adapters/wakeLock'
import { createWebAudioAlarm } from '../adapters/alarm'
import { BaseCoveredLines } from '../components/BaseCoveredLines'
import { CookNavTiles } from '../components/CookNavTiles'
import { CookedConfirmation } from '../components/CookedConfirmation'
import { CookIngredientsSheet, RailIngredients } from '../components/CookReadyParts'
import { GetReadyTile } from '../components/GetReadyTile'
import { CookTimers, CookTimerSheets } from '../components/CookTimers'
import { CookTopRow } from '../components/CookTopRow'
import { CourseFilterChips } from '../components/CourseFilterChips'
import { CourseMenu } from '../components/CourseMenu'
import { StepTile } from '../components/StepTile'
import { TimelineAdvanceTile } from '../components/TimelineAdvanceTile'
import { useCoachMark } from '../hooks/useCoachMark'
import { useCookTimerPanel } from '../hooks/useCookTimerPanel'
import { useCookTimeline } from '../hooks/useCookTimeline'
import { useCookedMoment } from '../hooks/useCookedMoment'
import { useCookReady } from '../hooks/useCookReady'
import type { GetReadySource } from '../hooks/useGetReady'
import { useFormatUse } from '../hooks/useFormatUse'
import { useTimerAlarm, useVoiceCommands, useVoicePreference, useWakeLock } from '../hooks/useDevice'
import { courseCookedMoment } from '../lib/cooked'
import { futureLine } from '../lib/future'
import { backLabel, originOf, returnTarget } from '../lib/origin'
import { sameScope } from '../lib/scope'
import {
  allMode as isAllMode,
  canMark as canMarkDate,
  filterChips,
  finishedCooking,
  leaveIfNothingLeft,
  markTarget as pickMarkTarget,
  title as headerTitle,
} from '../lib/timeline'
import type { VoiceCommand } from '../lib/voice'
import { cookStrings } from '../strings'
import type { CookTimelineTarget, TimelineView } from '../types'
import { EmptyState, Button } from '../../../ui'
import { useDocumentTitle } from '../../../ui/lib/useDocumentTitle'
import '../cook.css'

/** The plan key of one Course of the slot (crs-c3: every key names its Course). */
export const courseKeyOf = (target: CookTimelineTarget, courseId: number): SlotKey => ({ date: target.date, mealSlotId: target.mealSlotId, courseId })

/** B9-45 (PC-05): the Recipes Get ready lists, one per fresh Course still to cook (a Leftover Course has no Ingredients). */
function readySources(view: TimelineView | undefined): GetReadySource[] {
  if (!view) return []
  return view.courses
    .filter((c) => c.fresh && c.state === 'planned')
    .map((c) => ({ courseId: c.courseId, courseName: c.name, recipeId: c.recipeId, recipeName: c.recipeName, batches: c.batches }))
}

/** The portions the first fresh Course is planned for (null while the plan is not in). */
function plannedPortions(slots: PlanSlot[], target: CookTimelineTarget, courseId: number | undefined): number | null {
  const slot = slots.find((s) => s.date === target.date && s.mealSlotId === target.mealSlotId)
  if (!slot) return null
  const course = slot.courses?.find((c) => c.courseId === courseId)
  return course?.meal?.portions ?? slot.portions ?? null
}

export function TimelineCookScreen({ target }: { target: CookTimelineTarget }): ReactNode {
  const navigate = useNavigate()
  const location = useLocation()
  const client = useQueryClient()
  const plan = usePlan()
  // B9-45 (PC-05): Get ready before the first item. Its sources need the timeline and its portions the plan; until both are in,
  // the stage is "loading" (so the list never reads a Recipe cook's Yield, and Mark as Cooked is known once the Steps show).
  const cached = client.getQueryData<TimelineView>(['cook', 'view', 'timeline', target.date, target.mealSlotId])
  const sources = useMemo(() => readySources(cached), [cached])
  const slotId = `${target.date}/${target.mealSlotId}`
  const ready = useCookReady(`slot:${slotId}`, sources, plannedPortions(plan.slots, target, sources[0]?.courseId), cached !== undefined && !plan.isLoading, `meal:${slotId}`)
  const tl = useCookTimeline(target, plan.today, { hold: ready.hold })
  const view = tl.view
  const slotKey: SlotDayKey = { date: target.date, mealSlotId: target.mealSlotId }
  const open = tl.unresolved
  const several = view ? filterChips(view).length > 0 : false
  const allModeOn = isAllMode(tl.filter, open)
  const current = tl.item ? open.find((c) => c.courseId === tl.item!.courseId) : undefined

  // B9-45 (PC-02): Cook Mode shows no Cooked toast: the confirmation page is the moment, with its own Undo.
  const flow = useCookFlow({ toast: false })
  const marked = flow.cook
  const markCourse = flow.cookKey?.courseId ?? null
  const setMarkCourse = (courseId: number | null) => (courseId === null ? flow.close() : flow.open(courseKeyOf(target, courseId)))
  const allCooked = useAllCookedFlow({ toast: false })
  const notCooked = useNotCooked()
  const refreshTimeline = () => void client.invalidateQueries({ queryKey: ['cook', 'view', 'timeline'] })
  const { dismissShortfalls: dismissOne } = flow
  const { dismissShortfalls: dismissAll } = allCooked
  const onUndone = useCallback(async () => {
    dismissOne()
    dismissAll()
    await client.refetchQueries({ queryKey: ['cook', 'view', 'timeline'] })
  }, [client, dismissOne, dismissAll])
  const cooked = useCookedMoment(allCooked.controller.result, onUndone)
  // B9-45 (PC-02): where Cook Mode was opened from (location.state.from), else Today; Exit and the confirmation go back there.
  const origin = returnTarget(originOf(location.state))
  const leave = () => navigate(origin.path)

  const alarm = useMemo(() => createWebAudioAlarm(), [])
  const speech = useMemo(() => createBrowserSpeech(), [])
  const wake = useMemo(() => createWakeLock(), [])
  useWakeLock(wake)
  useTimerAlarm(tl.timers.timers, alarm)
  const [voiceOn, setVoiceOn] = useVoicePreference()
  const [coachOn, dismissCoach] = useCoachMark()
  const panel = useCookTimerPanel(tl.timers, tl.gate.holdingIds)
  const titleText = view ? headerTitle(view, several, plan.today) : undefined
  useDocumentTitle([cookStrings.documentTitle, titleText])
  const formatUse = useFormatUse()
  const finish = leave
  // Start cooking moves focus into Step 1 (the Step tile focuses itself once, on that mount).
  const [focusStep, setFocusStep] = useState(false)
  useEffect(() => {
    if (focusStep) setFocusStep(false)
  }, [focusStep])

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
  const cookedAny = cooked.moment !== null
  const skipCourse = async (courseId: number) => {
    const skipped = await notCooked(courseKeyOf(target, courseId))
    if (skipped) afterSkip()
  }
  // Skipping the last open Course with nothing Cooked leaves at once, as the old screen did (no "No Steps" page).
  const afterSkip = () => {
    if (leaveIfNothingLeft(open.length, cookedAny) === 'leave') finish()
    else refreshTimeline()
  }
  const afterCook = (courseId: number | null, result: NonNullable<typeof marked.result>) => {
    const course = view?.courses.find((c) => c.courseId === courseId)
    if (view && course) cooked.course(courseCookedMoment(courseKeyOf(target, course.courseId), view.slotName, result, course.recipeName, view.courses.length > 1 ? course.name : null))
    refreshTimeline()
  }

  // Everything marked: the confirmation page. Otherwise the screen stays while other Courses remain.
  const finished = finishedCooking({ cookedAny, notCookable: tl.notCookable, loaded: view !== undefined, unresolvedCount: open.length })
  if (finished && cooked.moment) {
    // The last thing cooked here: the whole slot (Mark all Cooked) or one Course; its ONE notice and ONE Correct Stock sheet.
    const m = cooked.moment
    const notice = cooked.all ? allCooked : flow
    return (
      <div className="cook-screen" data-layout="confirmation">
        <CookedConfirmation
          recipeName={m.recipeName}
          mealLabel={m.mealLabel}
          leftovers={m.leftovers}
          leaveLabel={backLabel(origin)}
          onLeave={leave}
          onUndo={() => void cooked.undo()}
          undoLabel={m.undoLabel}
          undoBusy={cooked.undoBusy}
        >
          <ShortfallSheets groups={notice.shortfalls} correct={notice.correct} onDismiss={notice.dismissShortfalls} system={notice.system} placement="cooked" />
        </CookedConfirmation>
      </div>
    )
  }
  if (tl.notCookable) return <EmptyState title={cookStrings.notCookable} action={<Button variant="secondary" onClick={finish}>{cookStrings.back}</Button>} />
  if (tl.error) return <EmptyState title={cookStrings.loadError} />
  if (!view || ready.stage === 'loading') return <EmptyState title={cookStrings.loading} />
  const onReady = ready.stage === 'ready'
  const listWhileCooking = !onReady && ready.list.available

  const isLast = tl.isLast
  const markable = canMarkDate(target.date, plan.today, open)
  const onMarkCooked =
    isLast && markable
      ? () => (allModeOn ? allCooked.open(slotKey, open.map((c) => c.courseId)) : setMarkCourse(pickMarkTarget(allModeOn, current?.courseId ?? null, open)))
      : undefined
  const future = futureLine(target.date, plan.today)
  const belongs = (timerScope: string | null) => (view ? view.courses.some((c) => sameScope(timerScope, c.scope)) : false)
  const timerProps = { panel, scope: tl.item?.scope ?? '', items: tl.timers.items, holdingIds: tl.gate.holdingIds, belongs }
  const startCooking = () => {
    ready.start()
    setFocusStep(true)
  }

  return (
    <div className="cook-screen" data-layout={panel.short ? 'short' : panel.rail ? 'rail' : 'strip'}>
      <div className="cook-main">
        <CookTopRow
          speechSupported={speech.supported}
          voiceOn={voiceOn}
          onVoiceChange={setVoiceOn}
          onExit={finish}
          onIngredients={listWhileCooking && !panel.rail ? ready.openSheet : undefined}
        />
        <header className="cook-screen__header">
          <h1 className="cook-screen__title">{titleText}</h1>
          {several ? <CourseMenu entries={tl.courseMenu} onCooked={(c) => setMarkCourse(c)} onNotCooked={(c) => void skipCourse(c)} /> : null}
          <CourseFilterChips chips={tl.chips} selected={tl.filter} onSelect={tl.setFilter} />
        </header>
        <TimelineAdvanceTile
          groups={tl.filter === 'all' || panel.short ? tl.advance : []}
          compact={panel.short}
          collapsed={tl.nav.index > 0}
          onMarkDone={(scope, step) => void tl.markAdvanceDone(scope, step)}
        />
        {onReady ? (
          <GetReadyTile sections={ready.list.sections} meta={ready.list.meta} ticked={ready.ticks.ticked} onToggle={ready.ticks.toggle} />
        ) : tl.step ? (
          <StepTile
            key={`${tl.item?.courseId}-${tl.step.index}-${tl.step.number}`}
            focusOnMount={focusStep}
            step={tl.step}
            formatUse={formatUse}
            tapZones
            coachMark={coachOn}
            onCoachDismiss={dismissCoach}
            onBack={tl.back}
            onNext={tl.gate.next}
            caption={several ? tl.caption : null}
            clock={several ? tl.clock : null}
            ready={tl.ready}
          >
            <BaseCoveredLines lines={tl.covered} />
          </StepTile>
        ) : (
          <p className="cook-screen__empty">{cookStrings.noSteps}</p>
        )}
        <CookNavTiles
          isFirst={onReady || tl.isFirst}
          isLast={onReady ? false : isLast}
          onBack={tl.back}
          onNext={onReady ? startCooking : tl.gate.next}
          nextLabel={onReady ? cookStrings.startCooking : undefined}
          heldText={onReady ? null : tl.gate.heldText}
          futureLine={future}
          onLeave={future ? () => navigate('/plan') : undefined}
          onMarkCooked={onMarkCooked}
          markLabel={allModeOn ? cookStrings.markAllCooked : undefined}
        >
          <CookTimers {...timerProps} placement="strip" />
        </CookNavTiles>
      </div>
      <CookTimers {...timerProps} placement="rail">
        {listWhileCooking ? <RailIngredients ready={ready} /> : null}
      </CookTimers>
      <CookTimerSheets {...timerProps} />
      {listWhileCooking ? <CookIngredientsSheet ready={ready} /> : null}
      <MarkCookedSheet
        open={markCourse !== null}
        onClose={() => setMarkCourse(null)}
        preview={marked.preview}
        isLoading={marked.isLoading}
        leftover={marked.leftover}
        onLeftoverChange={marked.setLeftover}
        onConfirm={async () => {
          const courseId = markCourse
          const result = await flow.confirm()
          if (result) afterCook(courseId, result)
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
            cooked.markedAll(slotKey, view.slotName, ids)
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
