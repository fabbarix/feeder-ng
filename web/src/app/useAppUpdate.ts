// B9-21 (RES-10): shows the "A new version of Feeder is ready" toast when a new worker waits. The prompt never interrupts:
// it is held while Scans or Ticks wait to sync, while a form has unsaved changes, and in Cook Mode and on the receipt
// screens, and shows once nothing holds it back. The Kitchen board is an unattended wall display: there the update is
// applied without a prompt (nothing can be lost there), once per waiting worker and only when nothing waits to sync.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useToast } from '../ui/Toast'
import { isChromeless } from './chromeless'
import { onAppUpdateReady, type UpdateControls } from './serviceWorker'
import { updateStrings } from './strings'

export interface AppUpdateInputs {
  /** Scans and Ticks waiting to sync (the prompt is held back while > 0) */
  pendingSyncCount?: number
  /** a form has unsaved changes (the prompt is held back) */
  hasUnsavedChanges?: boolean
  /** default: onAppUpdateReady from ./serviceWorker */
  subscribe?: (listener: (controls: UpdateControls) => void) => () => void
}

/**
 * "Stays until acted on": the toast has no sticky option yet (B9-18 may add one), so an explicit day, which an explicit
 * duration always wins with, and which fits setTimeout's 2^31 - 1 ms.
 */
const UNTIL_ACTED_ON_MS = 24 * 60 * 60 * 1000

const BOARD = /^\/board(\/|$)/

/** What to do with a waiting update on this screen: show the prompt, hold it, or (the Kitchen board) apply it. */
export type UpdateMove = 'prompt' | 'hold' | 'apply'

export function updateMove(pathname: string, pendingSyncCount: number, hasUnsavedChanges: boolean): UpdateMove {
  if (pendingSyncCount > 0 || hasUnsavedChanges) return 'hold'
  if (BOARD.test(pathname)) return 'apply'
  if (isChromeless(pathname)) return 'hold' // Cook Mode and the receipt screens: someone is in the middle of something
  return 'prompt'
}

/**
 * Whether the prompt was shown, per update source: the prompt comes once per session, also when the shell mounts again
 * (the source replays the newest update to a new subscriber). Keyed by the source so each test's fake starts fresh.
 */
const promptedBySource = new WeakMap<object, { prompted: boolean }>()
function sessionOf(subscribe: object): { prompted: boolean } {
  let session = promptedBySource.get(subscribe)
  if (!session) promptedBySource.set(subscribe, (session = { prompted: false }))
  return session
}

export function useAppUpdate({ pendingSyncCount = 0, hasUnsavedChanges = false, subscribe = onAppUpdateReady }: AppUpdateInputs = {}): void {
  const { show } = useToast()
  const { pathname } = useLocation()
  const [ready, setReady] = useState<UpdateControls | null>(null)
  /** shown or put off with Later: the prompt comes once per session */
  const session = sessionOf(subscribe)
  const applied = useRef<UpdateControls | null>(null)

  useEffect(() => subscribe((controls) => setReady(controls)), [subscribe])

  const move = updateMove(pathname, pendingSyncCount, hasUnsavedChanges)
  useEffect(() => {
    if (!ready) return
    if (move === 'apply') {
      if (applied.current === ready) return
      applied.current = ready
      ready.applyUpdate()
      return
    }
    if (move !== 'prompt' || session.prompted) return
    session.prompted = true
    show({
      status: 'info',
      title: updateStrings.updateReady,
      actions: [
        { label: updateStrings.reload, onClick: () => ready.applyUpdate() },
        // Later: the new version applies at the next launch, when every Feeder tab has closed.
        { label: updateStrings.later, onClick: () => {} },
      ],
      durationMs: UNTIL_ACTED_ON_MS,
    })
  }, [ready, move, show, session])
}
