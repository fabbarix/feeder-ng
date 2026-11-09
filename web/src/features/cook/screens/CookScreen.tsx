import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { MarkCookedSheet, useMarkCooked } from '../../plan'
import { createBrowserSpeech } from '../adapters/speech'
import { createWakeLock } from '../adapters/wakeLock'
import { createWebAudioAlarm } from '../adapters/alarm'
import { AdvanceStepsTile } from '../components/AdvanceStepsTile'
import { CookNavTiles } from '../components/CookNavTiles'
import { CookTimerStrip } from '../components/CookTimerStrip'
import { StepTile } from '../components/StepTile'
import { VoiceToggle } from '../components/VoiceToggle'
import { useCookSession } from '../hooks/useCookSession'
import { useMediaQuery, useTimerAlarm, useVoiceCommands, useVoicePreference, useWakeLock } from '../hooks/useDevice'
import { useTimers } from '../hooks/useTimers'
import { cookSourceFrom, type CookRouteParams } from '../lib/scope'
import type { VoiceCommand } from '../lib/voice'
import { cookStrings } from '../strings'
import { Button, Chip, EmptyState } from '../../../ui'
import '../cook.css'

/**
 * Cook Mode. Routes: /cook/meal/:date/:slotId and /cook/recipe/:id (?batches=, default 1).
 * Composes (render + wire only) useCookSession, useTimers(scope), useTimerAlarm,
 * useWakeLock(createWakeLock()), useVoiceCommands(createBrowserSpeech()) with
 * useVoicePreference, and: AdvanceStepsTile, StepTile (tapZones on a tablet-width
 * viewport), CookTimerStrip, CookNavTiles, VoiceToggle. Voice commands: next/back
 * call the session, repeat bumps repeat, startTimer calls startStepTimer, pauseTimer
 * pauses the first running timer. Mark as Cooked opens T11's MarkCookedSheet through
 * useMarkCooked(markCookedKey) from features/plan; a finished cook returns to "/".
 * A not_cookable meal shows an EmptyState. Wake Lock is held while the screen is mounted.
 */
export function CookScreen(): ReactNode {
  const params = useParams() as CookRouteParams
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const batches = search.get('batches')
  const source = useMemo(() => cookSourceFrom(params, batches), [params, batches])

  const session = useCookSession(source)
  const timers = useTimers(session.scope)
  const alarm = useMemo(() => createWebAudioAlarm(), [])
  const speech = useMemo(() => createBrowserSpeech(), [])
  const wake = useMemo(() => createWakeLock(), [])
  useWakeLock(wake)
  useTimerAlarm(timers.timers, alarm)
  const [voiceOn, setVoiceOn] = useVoicePreference()
  const tapZones = useMediaQuery('(min-width: 768px)')
  const marked = useMarkCooked(session.markCookedKey)
  const [sheetOpen, setSheetOpen] = useState(false)

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

  if (session.notCookable) {
    return <EmptyState title={cookStrings.notCookable} action={<Button variant="tonal" onClick={() => navigate('/')}>{cookStrings.back}</Button>} />
  }
  if (session.error) return <EmptyState title={cookStrings.loadError} />
  const view = session.view
  if (!view) return <EmptyState title={cookStrings.loading} />

  const finishCook = () => navigate('/')
  return (
    <div className="cook-screen">
      <header className="cook-screen__header">
        <h1 className="cook-screen__title">{view.recipeName}</h1>
        <Chip>{cookStrings.batches(view.batches)}</Chip>
        <VoiceToggle supported={speech.supported} enabled={voiceOn} onChange={setVoiceOn} />
        {wake.supported ? <Chip>{cookStrings.wakeLockOn}</Chip> : null}
      </header>
      <AdvanceStepsTile summary={session.advance} onMarkDone={(stepIndex) => void session.markAdvanceDone(stepIndex)} />
      {session.step ? (
        <StepTile
          key={`${session.step.index}-${session.repeatCount}`}
          step={session.step}
          tapZones={tapZones}
          onBack={session.back}
          onNext={session.next}
        />
      ) : (
        <p className="cook-screen__empty">{cookStrings.noSteps}</p>
      )}
      <CookTimerStrip
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
        onMarkCooked={view.meal ? () => setSheetOpen(true) : undefined}
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
            if (await marked.confirm()) finishCook()
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
