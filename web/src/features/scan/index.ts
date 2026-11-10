import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { ScanScreen } from './screens/ScanScreen'

// The centre "Scan" button of the bottom bar: the Scan screen (Shop mode or Stock-take).
export const routes: RouteObject[] = [{ path: '/scan', element: createElement(ScanScreen) }]

export { useScanSession, useScanSessionActive } from './hooks/useScanSessionActive'

import { registerServiceWorker } from './registerSw'

registerServiceWorker()
