import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ACCESS_REQUESTS_PATH } from './lib/paths'
import { AccessRequestsPage } from './screens/AccessRequestsPage'

// Any signed-in User may answer Access Requests: /settings/access-requests, reached from the avatar menu.
export const routes: RouteObject[] = [{ path: ACCESS_REQUESTS_PATH, element: createElement(AccessRequestsPage) }]

// The shell's status slot calls this on every screen: how many sign-in requests wait.
export { useShellStatus } from './hooks/useShellStatus'
