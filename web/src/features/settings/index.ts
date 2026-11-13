import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { recipeAssistantSettingsRoute } from '../recipe-assistant'
import { AllowlistPage } from './screens/AllowlistPage'
import { HouseholdPage } from './screens/HouseholdPage'
import { CoursesPage } from './screens/CoursesPage'
import { MealSlotsPage } from './screens/MealSlotsPage'
import { MembersPage } from './screens/MembersPage'
import { PreferencesPage } from './screens/PreferencesPage'
import { SettingsIndexPage } from './screens/SettingsIndexPage'

export const routes: RouteObject[] = [
  { path: '/settings', element: createElement(SettingsIndexPage) },
  { path: '/settings/household', element: createElement(HouseholdPage) },
  { path: '/settings/members', element: createElement(MembersPage) },
  { path: '/settings/meal-slots', element: createElement(MealSlotsPage) },
  { path: '/settings/courses', element: createElement(CoursesPage) },
  { path: '/settings/allowlist', element: createElement(AllowlistPage) },
  { path: '/settings/preferences', element: createElement(PreferencesPage) },
  recipeAssistantSettingsRoute,
]

// B5-F1: Who's eating for Plan and Today (the Date Attendance sheet with Guests and a read-only date). Features use the sheet through here only.
export { WhosEatingSheet } from './components/WhosEatingSheet'
export type { WhosEatingSheetProps } from './components/WhosEatingSheet'
export type { WhosEatingTarget } from './hooks/useAttendanceSheet'
