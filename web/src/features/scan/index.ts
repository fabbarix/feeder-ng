import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ScanScreen } from './screens/ScanScreen'

// The centre "Scan" button of the bottom bar: the Scan screen (Shop mode or Stock-take).
export const routes: RouteObject[] = [{ path: '/scan', element: createElement(ScanScreen) }]

export { useScanSession, useScanSessionActive } from './hooks/useScanSessionActive'
// The shell's status banner calls this on every screen (docs/dev/design/wp5-shell.md).
export { useShellStatus } from './hooks/useShellStatus'

import { registerServiceWorker } from './registerSw'

registerServiceWorker()
