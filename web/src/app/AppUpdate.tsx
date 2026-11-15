// B9-21 (RES-10): the one place the update toast is wired. Renders nothing; sums the Scans and Ticks waiting to sync over the
// features' useShellStatus hooks (the same hooks AppRoot calls) into useAppUpdate. Sits beside AppRoot in main.tsx.
import type { ShellStatusHook } from './features'
import { useHasUnsavedChanges } from '../ui/lib/unsavedChanges'
import { useAppUpdate } from './useAppUpdate'
import { useShellStatus } from './useShellStatus'

export interface AppUpdateProps {
  /** The features' useShellStatus hooks (collectFeatures().statusHooks), as AppRoot gets them. */
  statusHooks?: ShellStatusHook[]
}

const NO_HOOKS: ShellStatusHook[] = []

export function AppUpdate({ statusHooks = NO_HOOKS }: AppUpdateProps): null {
  // The hook list is fixed for the app's life (collected once at startup), so the hooks run in the same order every render.
  // B9-49: Scans and Ticks waiting to sync both hold the prompt back.
  const { syncCount: pendingSyncCount } = useShellStatus(statusHooks)
  // B9-31: a form with unsaved changes (ui/lib/unsavedChanges.ts) holds the "new version" prompt back.
  const hasUnsavedChanges = useHasUnsavedChanges()
  useAppUpdate({ pendingSyncCount, hasUnsavedChanges })
  return null
}
