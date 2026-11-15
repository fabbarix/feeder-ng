import type { RouteObject } from 'react-router-dom'
import { lazyScreen } from '../../app/lazyScreen'

// Cook Mode runs without the AppShell bar (see app/chromeless.ts). B9-59: its screens load on demand; one import for the
// three routes of the Cook screen, so they share one chunk.
const cookScreen = () => import('./screens/CookScreen')
export const routes: RouteObject[] = [
  { path: '/cook/meal/:date/:slotId', element: lazyScreen(cookScreen, 'CookScreen') },
  { path: '/cook/meal/:date/:slotId/:courseId', element: lazyScreen(cookScreen, 'CookScreen') },
  { path: '/cook/recipe/:id', element: lazyScreen(cookScreen, 'CookScreen') },
  { path: '/cook/reheat/:date/:slotId/:courseId', element: lazyScreen(() => import('./screens/ReheatScreen'), 'ReheatScreen') },
]
export { cookMealPath, cookRecipePath } from './lib/scope'
export { cookReheatPath } from './lib/reheat'
