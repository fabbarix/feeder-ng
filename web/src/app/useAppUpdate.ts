// B9-21 (RES-10): shows the "A new version of Feeder is ready" toast. STUB: the developer implements it.
import type { UpdateControls } from './serviceWorker'

export interface AppUpdateInputs {
  /** Scans and Ticks waiting to sync (the prompt is held back while > 0) */
  pendingSyncCount?: number
  /** a form has unsaved changes (the prompt is held back) */
  hasUnsavedChanges?: boolean
  /** default: onAppUpdateReady from ./serviceWorker */
  subscribe?: (listener: (controls: UpdateControls) => void) => () => void
}

export function useAppUpdate(_inputs?: AppUpdateInputs): void {
  throw new Error('not implemented: useAppUpdate')
}
