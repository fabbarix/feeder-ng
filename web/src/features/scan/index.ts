import type { RouteObject } from 'react-router-dom'
import { lazyScreen } from '../../app/lazyScreen'

// The centre "Scan" button of the bottom bar: the Scan screen (Shop mode or Stock-take).
export const routes: RouteObject[] = [{ path: '/scan', element: lazyScreen(() => import('./screens/ScanScreen'), 'ScanScreen') }]

export { useScanSession, useScanSessionActive } from './hooks/useScanSessionActive'
// The shell's status banner calls this on every screen (docs/dev/design/wp5-shell.md).
export { useShellStatus } from './hooks/useShellStatus'
