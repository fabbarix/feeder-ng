// B9-45 (PC-05, decision PC 6): Cook Mode's "Get ready" stage, before the first Step. It shows while nothing of this cook is under way
// (no resume Step stored when Cook Mode opened) and the Recipes have Ingredient lines; Start cooking leaves it for good. While it is
// loading Cook Mode waits rather than flash Step 1; when the list cannot be had, Cook Mode opens on Step 1 as before. The ticks are
// local (useReadyTicks), and the Ingredients sheet of the Steps shares them.
import { useCallback, useState } from 'react'
import { hasResumeUnder } from '../lib/resume'
import { useGetReady, type GetReady, type GetReadySource } from './useGetReady'
import { useReadyTicks, type ReadyTicks } from './useReadyTicks'

export type ReadyStage = 'loading' | 'ready' | 'steps'

export interface CookReady {
  stage: ReadyStage
  /** The session and the timeline start no timer and keep no resume Step until the Steps show. */
  hold: boolean
  list: GetReady
  ticks: ReadyTicks
  /** Start cooking: on to Step 1 (the screen moves focus into it). */
  start: () => void
  /** The Ingredients sheet of the Steps (below 64 em; from there the list sits in the rail). */
  sheetOpen: boolean
  openSheet: () => void
  closeSheet: () => void
}

/** `scope` is the cook scope (`recipe:7`, `meal:<date>/<slot>`); `sources` are known once the view is in (empty until then). */
export function useCookReady(scope: string, sources: GetReadySource[], portions: number | null, sourcesKnown: boolean): CookReady {
  // Read once, when Cook Mode opens: the session saves its Step from then on.
  const [resumed] = useState(() => hasResumeUnder(scope))
  const [started, setStarted] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const list = useGetReady(sources, portions)
  const ticks = useReadyTicks(scope)
  const stage: ReadyStage = resumed || started ? 'steps' : !sourcesKnown || list.isLoading ? 'loading' : list.available ? 'ready' : 'steps'
  const start = useCallback(() => setStarted(true), [])
  return {
    stage,
    hold: stage !== 'steps',
    list,
    ticks,
    start,
    sheetOpen,
    openSheet: useCallback(() => setSheetOpen(true), []),
    closeSheet: useCallback(() => setSheetOpen(false), []),
  }
}
