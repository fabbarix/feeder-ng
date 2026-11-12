import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { CookScreen } from './screens/CookScreen'
import { ReheatScreen } from './screens/ReheatScreen'

// Cook Mode runs without the AppShell bar (see app/chromeless.ts).
export const routes: RouteObject[] = [
  { path: '/cook/meal/:date/:slotId', element: createElement(CookScreen) },
  { path: '/cook/meal/:date/:slotId/:courseId', element: createElement(CookScreen) },
  { path: '/cook/recipe/:id', element: createElement(CookScreen) },
  { path: '/cook/reheat/:date/:slotId/:courseId', element: createElement(ReheatScreen) },
]
export { cookMealPath, cookRecipePath } from './lib/scope'
export { cookReheatPath } from './lib/reheat'
