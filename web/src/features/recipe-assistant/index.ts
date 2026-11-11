import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { RecipeAssistantSettingsPage } from './screens/RecipeAssistantSettingsPage'

export { RecipeAssistantSettingsPage }

/** The route object the settings feature registers (features/settings/index.ts); its Settings index row is in settingsSections. */
export const recipeAssistantSettingsRoute: RouteObject = {
  path: '/settings/recipe-assistant',
  element: createElement(RecipeAssistantSettingsPage),
}

/** Nothing is registered here: the settings feature registers the route, so auto-discovery gets an empty list. */
export const routes: RouteObject[] = []
