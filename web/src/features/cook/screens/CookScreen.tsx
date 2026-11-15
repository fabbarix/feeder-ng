import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { createBrowserSpeech } from '../adapters/speech'
import { createWakeLock } from '../adapters/wakeLock'
import { createWebAudioAlarm } from '../adapters/alarm'
import { AdvanceStepsTile } from '../components/AdvanceStepsTile'
import { CookNavTiles } from '../components/CookNavTiles'
import { CookIngredientsSheet, RailIngredients } from '../components/CookReadyParts'
import { GetReadyTile } from '../components/GetReadyTile'
import { CookTimers, CookTimerSheets } from '../components/CookTimers'
import { BaseCoveredLines } from '../components/BaseCoveredLines'
import { CookTopRow } from '../components/CookTopRow'
import { StepTile } from '../components/StepTile'
import { useCoachMark } from '../hooks/useCoachMark'
import { useCookReady } from '../hooks/useCookReady'
import { useCookSession } from '../hooks/useCookSession'
import { useFormatUse } from '../hooks/useFormatUse'
import { useTimerAlarm, useVoiceCommands, useVoicePreference, useWakeLock } from '../hooks/useDevice'
import { useCookTimerPanel } from '../hooks/useCookTimerPanel'
import { useStepGate } from '../hooks/useStepGate'
import { useTimers } from '../hooks/useTimers'
import { originOf, returnTarget } from '../lib/origin'
import { cookSourceFrom, exitPathFor, scopeOf, timelineTargetFrom, type CookRouteParams } from '../lib/scope'
import { TimelineCookScreen } from './TimelineCookScreen'
import type { VoiceCommand } from '../lib/voice'
import type { CookView } from '../types'
import { cookStrings } from '../strings'
import { Button, EmptyState } from '../../../ui'
import { useDocumentTitle } from '../../../ui/lib/useDocumentTitle'
import '../cook.css'

/**
 * Cook Mode. Routes: /cook/meal/:date/:slotId and /cook/recipe/:id (?batches=, default 1).
 * Composes (render + wire only) useCookSession, useTimers() (every household timer), useTimerAlarm,
 * useWakeLock(createWakeLock()), useVoiceCommands(createBrowserSpeech()) with useVoicePreference, useCoachMark, useCookTimerPanel
 * (strip, rail, sheets), and: CookTopRow (Exit, Voice), AdvanceStepsTile (the tile on Step 1, one info line after, the chip in short
 * landscape), StepTile (tap zones at every width, decision SHORT 3), CookTimers and CookNavTiles. The document title is
 * "Cook Mode · <Recipe> · Feeder" (A11Y-01).
 * Exit goes to exitPathFor(source). Voice commands: next/back call the session, repeat bumps repeat, startTimer calls
 * startStepTimer, pauseTimer pauses the first running timer. Mark as Cooked opens T11's MarkCookedSheet through
 * useMarkCooked(markCookedKey) from features/plan. useStepGate holds Next (tile, tap zone and voice) while the next
 * Step waits for a Step whose timer is still counting down; cancelling that timer frees it. A Planned Meal is offered
 * Mark as Cooked only once it is due (mayResolve); before that its last Step offers Back to Plan (PC-12). A Recipe cook's
 * "Back to Recipe" forgets the resume Step. After a successful Mark as Cooked, CookedConfirmation replaces the Step and leaves with
 * "Back to Today" (no timed redirect). A not_cookable meal shows an EmptyState. Wake Lock is held while the screen is mounted.
 */
/**
 * Cook Mode. A Planned Meal route (/cook/meal/:date/:slotId[/:courseId]) opens the slot's cooking timeline (CRS F); a
 * Recipe route (/cook/recipe/:id) opens its own session.
 */
export function CookScreen(): ReactNode {
  const params = useParams() as CookRouteParams
  const target = params.date !== undefined && params.slotId !== undefined ? timelineTargetFrom(params) : null
  if (target) return <TimelineCookScreen target={target} />
  return <SessionCookScreen />
}

/** The cook view as the session's query holds it (read in the render before the session, to place Get ready). */
function useQueryClientView(source: ReturnType<typeof cookSourceFrom>) {
  return useQueryClient().getQueryData<CookView>(['cook', 'view', scopeOf(source)])
}

function SessionCookScreen(): ReactNode {
  const params = useParams() as CookRouteParams
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const batches = search.get('batches')
  const source = useMemo(() => cookSourceFrom(params, batches), [params, batches])
  const location = useLocation()

  // B9-45 (PC-05): Get ready first (the Recipe's lines times the Batches, at its Yield); the session holds its timers and resume Step meanwhile.
  const cachedView = useQueryClientView(source)
  const sources = useMemo(
    () => (cachedView ? [{ recipeId: cachedView.recipeId, recipeName: cachedView.recipeName, batches: cachedView.batches }] : []),
    [cachedView],
  )
  const ready = useCookReady(scopeOf(source), sources, null, cachedView !== undefined)
  const session = useCookSession(source, { hold: ready.hold })
  const timers = useTimers()
  const gate = useStepGate(session.view?.steps ?? [], session.nav.index, timers.items, session.scope, session.next)
  const alarm = useMemo(() => createWebAudioAlarm(), [])
  const speech = useMemo(() => createBrowserSpeech(), [])
  const wake = useMemo(() => createWakeLock(), [])
  useWakeLock(wake)
  useTimerAlarm(timers.timers, alarm)
  const [voiceOn, setVoiceOn] = useVoicePreference()
  const [coachOn, dismissCoach] = useCoachMark()
  const panel = useCookTimerPanel(timers, gate.holdingIds)
  useDocumentTitle([cookStrings.documentTitle, session.view?.recipeName])
  const formatUse = useFormatUse()
  // B9-45 (PC-02): Exit returns to where Cook Mode was opened from, else the Recipe.
  const leaveCook = () => navigate(returnTarget(originOf(location.state), { path: exitPathFor(source), label: 'Recipe' }).path)
  const [focusStep, setFocusStep] = useState(false)
  useEffect(() => {
    if (focusStep) setFocusStep(false)
  }, [focusStep])
  // A Recipe cook's "Back to Recipe" ends it: the resume Step is forgotten (standing ruling), then the Recipe opens.
  const doneWithRecipe = () => {
    session.clearResume()
    if (session.view) navigate(`/recipes/${session.view.recipeId}`)
  }

  const onCommand = (command: VoiceCommand) => {
    if (command === 'next') gate.next()
    else if (command === 'back') session.back()
    else if (command === 'repeat') session.repeat()
    else if (command === 'startTimer') void session.startStepTimer()
    else if (command === 'pauseTimer') {
      const running = timers.items.find((i) => i.timer.state === 'running')
      if (running) void timers.pause(running.timer.id)
    }
  }
  useVoiceCommands({ adapter: speech, enabled: voiceOn, onCommand })

  if (session.notCookable) {
    return <EmptyState title={cookStrings.notCookable} action={<Button variant="secondary" onClick={() => navigate('/')}>{cookStrings.back}</Button>} />
  }
  if (session.error) return <EmptyState title={cookStrings.loadError} />
  const view = session.view
  if (!view || ready.stage === 'loading') return <EmptyState title={cookStrings.loading} />

  const onReady = ready.stage === 'ready'
  const listWhileCooking = !onReady && ready.list.available
  const holdingIds = gate.holdingIds
  const timerProps = { panel, scope: session.scope, items: timers.items, holdingIds }
  return (
    <div className="cook-screen" data-layout={panel.short ? 'short' : panel.rail ? 'rail' : 'strip'}>
      <div className="cook-main">
        <CookTopRow
          speechSupported={speech.supported}
          voiceOn={voiceOn}
          onVoiceChange={setVoiceOn}
          onExit={leaveCook}
          onIngredients={listWhileCooking && !panel.rail ? ready.openSheet : undefined}
        />
        <header className="cook-screen__header">
          <h1 className="cook-screen__title">{view.recipeName}</h1>
          {view.batches > 1 ? <p className="cook-screen__batches">{cookStrings.batches(view.batches)}</p> : null}
        </header>
        <AdvanceStepsTile
          summary={session.advance}
          compact={panel.short}
          collapsed={session.nav.index > 0}
          onMarkDone={(stepIndex) => void session.markAdvanceDone(stepIndex)}
        />
        {onReady ? (
          <GetReadyTile sections={ready.list.sections} meta={ready.list.meta} ticked={ready.ticks.ticked} onToggle={ready.ticks.toggle} />
        ) : session.step ? (
          <StepTile
            key={`${session.step.index}-${session.repeatCount}`}
            focusOnMount={focusStep}
            step={session.step}
            formatUse={formatUse}
            tapZones
            coachMark={coachOn}
            onCoachDismiss={dismissCoach}
            onBack={session.back}
            onNext={gate.next}
            ready={session.ready}
          >
            <BaseCoveredLines lines={session.covered} />
          </StepTile>
        ) : (
          <p className="cook-screen__empty">{cookStrings.noSteps}</p>
        )}
        <CookNavTiles
          isFirst={onReady || session.isFirst}
          isLast={onReady ? false : session.isLast}
          onBack={session.back}
          onNext={
            onReady
              ? () => {
                  ready.start()
                  setFocusStep(true)
                }
              : gate.next
          }
          nextLabel={onReady ? cookStrings.startCooking : undefined}
          heldText={onReady ? null : gate.heldText}
          onDone={doneWithRecipe}
        >
          <CookTimers {...timerProps} placement="strip" />
        </CookNavTiles>
      </div>
      <CookTimers {...timerProps} placement="rail">
        {listWhileCooking ? <RailIngredients ready={ready} /> : null}
      </CookTimers>
      <CookTimerSheets {...timerProps} />
      {listWhileCooking ? <CookIngredientsSheet ready={ready} /> : null}
    </div>
  )
}
