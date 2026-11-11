import type { ShellStatusInfo } from '../../../app/features'
import { useAccessBadge } from './useAccessBadge'

/** The Access Request feature's contribution to the shell: how many sign-in requests wait. */
export function useShellStatus(): ShellStatusInfo {
  return { pendingAccessRequests: useAccessBadge() }
}
