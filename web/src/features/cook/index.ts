import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { CookScreen } from './screens/CookScreen'

// Cook Mode runs without the AppShell bar (see app/chromeless.ts).
export const routes: RouteObject[] = [
  { path: '/cook/meal/:date/:slotId', element: createElement(CookScreen) },
  { path: '/cook/recipe/:id', element: createElement(CookScreen) },
]
export { cookMealPath, cookRecipePath } from './lib/scope'
