import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { recipeAssistantSettingsRoute } from '../recipe-assistant'
import { AllowlistPage } from './screens/AllowlistPage'
import { HouseholdPage } from './screens/HouseholdPage'
import { MealSlotsPage } from './screens/MealSlotsPage'
import { MembersPage } from './screens/MembersPage'
import { PreferencesPage } from './screens/PreferencesPage'
import { SettingsIndexPage } from './screens/SettingsIndexPage'

export const routes: RouteObject[] = [
  { path: '/settings', element: createElement(SettingsIndexPage) },
  { path: '/settings/household', element: createElement(HouseholdPage) },
  { path: '/settings/members', element: createElement(MembersPage) },
  { path: '/settings/meal-slots', element: createElement(MealSlotsPage) },
  { path: '/settings/allowlist', element: createElement(AllowlistPage) },
  { path: '/settings/preferences', element: createElement(PreferencesPage) },
  recipeAssistantSettingsRoute,
]
