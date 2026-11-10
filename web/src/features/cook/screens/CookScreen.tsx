import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MarkCookedSheet, ShortfallNotice, StockCorrectionSheet, useMarkCooked, useStockSheet } from '../../plan'
import { mayResolve } from '../../plan/lib/resolve'
import { leftoverOutcomeText } from '../../plan/lib/cook'
import { createBrowserSpeech } from '../adapters/speech'
import { createWakeLock } from '../adapters/wakeLock'
import { createWebAudioAlarm } from '../adapters/alarm'
import { AdvanceStepsTile } from '../components/AdvanceStepsTile'
import { CookNavTiles } from '../components/CookNavTiles'
import { CookedConfirmation } from '../components/CookedConfirmation'
import { CookTimerStrip } from '../components/CookTimerStrip'
import { CookTopRow } from '../components/CookTopRow'
import { StepTile } from '../components/StepTile'
import { useCoachMark } from '../hooks/useCoachMark'
import { useCookSession } from '../hooks/useCookSession'
import { useFormatUse } from '../hooks/useFormatUse'
import { useMediaQuery, useTimerAlarm, useVoiceCommands, useVoicePreference, useWakeLock } from '../hooks/useDevice'
import { useTimers } from '../hooks/useTimers'
import { advanceOnScreen } from '../lib/advance'
import { cookSourceFrom, exitPathFor, type CookRouteParams } from '../lib/scope'
import type { VoiceCommand } from '../lib/voice'
import { cookStrings } from '../strings'
import { Button, EmptyState } from '../../../ui'
import '../cook.css'

/**
 * Cook Mode. Routes: /cook/meal/:date/:slotId and /cook/recipe/:id (?batches=, default 1).
 * Composes (render + wire only) useCookSession, useTimers() (every household timer), useTimerAlarm,
 * useWakeLock(createWakeLock()), useVoiceCommands(createBrowserSpeech()) with
 * useVoicePreference, useCoachMark, and: CookTopRow (Exit, the Step pill, voice), AdvanceStepsTile (before Step 1
 * only), StepTile (tapZones and the coach mark on a tablet-width viewport), CookTimerStrip, CookNavTiles.
 * Exit goes to exitPathFor(source). Voice commands: next/back
 * call the session, repeat bumps repeat, startTimer calls startStepTimer, pauseTimer
 * pauses the first running timer. Mark as Cooked opens T11's MarkCookedSheet through
 * useMarkCooked(markCookedKey) from features/plan. A Planned Meal is offered Mark as Cooked only once it is due
 * (mayResolve). After a successful Mark as Cooked, CookedConfirmation replaces the Step and leaves with "Back to
 * Today" (no timed redirect). A not_cookable meal shows an EmptyState. Wake Lock is held while the screen is mounted.
 */
export function CookScreen(): ReactNode {
  const params = useParams() as CookRouteParams
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const batches = search.get('batches')
  const source = useMemo(() => cookSourceFrom(params, batches), [params, batches])

  const session = useCookSession(source)
  const timers = useTimers()
  const alarm = useMemo(() => createWebAudioAlarm(), [])
  const speech = useMemo(() => createBrowserSpeech(), [])
  const wake = useMemo(() => createWakeLock(), [])
  useWakeLock(wake)
  useTimerAlarm(timers.timers, alarm)
  const [voiceOn, setVoiceOn] = useVoicePreference()
  const tapZones = useMediaQuery('(min-width: 768px)')
  const [coachOn, dismissCoach] = useCoachMark()
  const marked = useMarkCooked(session.markCookedKey)
  const stock = useStockSheet((id) => marked.dismissWarning(id))
  const formatUse = useFormatUse()
  const [sheetOpen, setSheetOpen] = useState(false)
  const finishCook = () => navigate('/')
  const leaveCook = () => navigate(exitPathFor(source))

  const onCommand = (command: VoiceCommand) => {
    if (command === 'next') session.next()
    else if (command === 'back') session.back()
    else if (command === 'repeat') session.repeat()
    else if (command === 'startTimer') void session.startStepTimer()
    else if (command === 'pauseTimer') {
      const running = timers.items.find((i) => i.timer.state === 'running')
      if (running) void timers.pause(running.timer.id)
    }
  }
  useVoiceCommands({ adapter: speech, enabled: voiceOn, onCommand })

  if (marked.result && marked.outcome) {
    return (
      <div className="cook-screen">
        <CookedConfirmation recipeName={marked.result.meal.recipeName} outcomeText={leftoverOutcomeText(marked.outcome)} onLeave={finishCook}>
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
  if (session.notCookable) {
    return <EmptyState title={cookStrings.notCookable} action={<Button variant="secondary" onClick={() => navigate('/')}>{cookStrings.back}</Button>} />
  }
  if (session.error) return <EmptyState title={cookStrings.loadError} />
  const view = session.view
  if (!view) return <EmptyState title={cookStrings.loading} />

  return (
    <div className="cook-screen">
      <CookTopRow
        number={session.step?.number ?? 0}
        of={view.steps.length}
        speechSupported={speech.supported}
        voiceOn={voiceOn}
        onVoiceChange={setVoiceOn}
        onExit={leaveCook}
      />
      <header className="cook-screen__header">
        <h1 className="cook-screen__title">{view.recipeName}</h1>
        {view.batches > 1 ? <p className="cook-screen__batches">{cookStrings.batches(view.batches)}</p> : null}
      </header>
      <AdvanceStepsTile
        summary={advanceOnScreen(session.advance, session.nav.index)}
        onMarkDone={(stepIndex) => void session.markAdvanceDone(stepIndex)}
      />
      {session.step ? (
        <StepTile
          key={`${session.step.index}-${session.repeatCount}`}
          step={session.step}
          formatUse={formatUse}
          tapZones={tapZones}
          coachMark={tapZones && coachOn}
          onCoachDismiss={dismissCoach}
          onBack={session.back}
          onNext={session.next}
        />
      ) : (
        <p className="cook-screen__empty">{cookStrings.noSteps}</p>
      )}
      <CookTimerStrip
        scope={session.scope}
        items={timers.items}
        onPause={(id) => void timers.pause(id)}
        onResume={(id) => void timers.resume(id)}
        onCancel={(id) => void timers.cancel(id)}
      />
      <CookNavTiles
        isFirst={session.isFirst}
        isLast={session.isLast}
        onBack={session.back}
        onNext={session.next}
        onMarkCooked={view.meal && mayResolve(view.meal.date, view.today) ? () => setSheetOpen(true) : undefined}
        onDone={view.meal ? undefined : () => navigate(`/recipes/${view.recipeId}`)}
      />
      {view.meal ? (
        <MarkCookedSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          preview={marked.preview}
          isLoading={marked.isLoading}
          leftover={marked.leftover}
          onLeftoverChange={marked.setLeftover}
          onConfirm={async () => {
            if (await marked.confirm()) setSheetOpen(false)
          }}
          onNotCooked={async () => {
            if (await marked.notCooked()) finishCook()
          }}
          busy={marked.busy}
          error={marked.error}
        />
      ) : null}
    </div>
  )
}
