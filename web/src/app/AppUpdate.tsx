// B9-21 (RES-10) STUB: the developer implements it. Renders nothing; mounts useAppUpdate with the Scans and Ticks waiting to sync.
import type { ShellStatusHook } from './features'

export interface AppUpdateProps {
  /** The features' useShellStatus hooks (collectFeatures().statusHooks), as AppRoot gets them. */
  statusHooks?: ShellStatusHook[]
}

export function AppUpdate(_props: AppUpdateProps): null {
  throw new Error('not implemented: AppUpdate')
}
