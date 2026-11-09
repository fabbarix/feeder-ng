import type { ReactNode } from 'react'

/**
 * Cook Mode. Routes: /cook/meal/:date/:slotId and /cook/recipe/:id (?batches=, default 1).
 * Composes (render + wire only) useCookSession, useTimers(scope), useTimerAlarm,
 * useWakeLock(createWakeLock()), useVoiceCommands(createBrowserSpeech()) with
 * useVoicePreference, and: AdvanceStepsTile, StepTile (tapZones on a tablet-width
 * viewport), CookTimerStrip, CookNavTiles, VoiceToggle. Voice commands: next/back
 * call the session, repeat bumps repeat, startTimer calls startStepTimer, pauseTimer
 * pauses the first running timer. Mark as Cooked opens T11's MarkCookedSheet through
 * useMarkCooked(markCookedKey) from features/plan (import after the branch is synced
 * with main); a finished cook returns to "/". A not_cookable meal shows an EmptyState.
 * Wake Lock is held while the screen is mounted.
 */
export function CookScreen(): ReactNode {
  return null
}
