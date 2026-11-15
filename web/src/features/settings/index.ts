import type { RouteObject } from 'react-router-dom'
import { recipeAssistantSettingsRoute } from '../recipe-assistant'
import { lazyScreen } from '../../app/lazyScreen'

export const routes: RouteObject[] = [
  { path: '/settings', element: lazyScreen(() => import('./screens/SettingsIndexPage'), 'SettingsIndexPage') },
  { path: '/settings/household', element: lazyScreen(() => import('./screens/HouseholdPage'), 'HouseholdPage') },
  { path: '/settings/members', element: lazyScreen(() => import('./screens/MembersPage'), 'MembersPage') },
  { path: '/settings/meal-slots', element: lazyScreen(() => import('./screens/MealSlotsPage'), 'MealSlotsPage') },
  { path: '/settings/courses', element: lazyScreen(() => import('./screens/CoursesPage'), 'CoursesPage') },
  { path: '/settings/allowlist', element: lazyScreen(() => import('./screens/AllowlistPage'), 'AllowlistPage') },
  { path: '/settings/preferences', element: lazyScreen(() => import('./screens/PreferencesPage'), 'PreferencesPage') },
  recipeAssistantSettingsRoute,
]

// B5-F1: Who's eating for Plan and Today (the Date Attendance sheet with Guests and a read-only date). Features use the sheet through here only.
export { WhosEatingSheet } from './components/WhosEatingSheet'
export type { WhosEatingSheetProps } from './components/WhosEatingSheet'
export type { WhosEatingTarget } from './hooks/useAttendanceSheet'
