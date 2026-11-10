import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { BoardScreen } from './screens/BoardScreen'

// The board runs without the AppShell bar (see app/chromeless.ts).
export const routes: RouteObject[] = [{ path: '/board', element: createElement(BoardScreen) }]
