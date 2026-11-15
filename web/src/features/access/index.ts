import type { RouteObject } from 'react-router-dom'
import { ACCESS_REQUESTS_PATH } from './lib/paths'
import { lazyScreen } from '../../app/lazyScreen'

// Any signed-in User may answer Access Requests: /settings/access-requests, reached from the avatar menu.
export const routes: RouteObject[] = [{ path: ACCESS_REQUESTS_PATH, element: lazyScreen(() => import('./screens/AccessRequestsPage'), 'AccessRequestsPage') }]

// The shell's status slot calls this on every screen: how many sign-in requests wait.
export { useAccessBadge } from './hooks/useAccessBadge'
export { AccessBadge } from './components/AccessBadge'
export { useShellStatus } from './hooks/useShellStatus'
// B9-52: an email or a name that never breaks mid-word (the Allowlist uses it too).
export { EmailSentence, EmailText, NameText } from './components/BreakText'
