import type { RouteObject } from 'react-router-dom'
import { lazyScreen } from '../../app/lazyScreen'

// The board runs without the AppShell bar (see app/chromeless.ts).
export const routes: RouteObject[] = [{ path: '/board', element: lazyScreen(() => import('./screens/BoardScreen'), 'BoardScreen') }]
