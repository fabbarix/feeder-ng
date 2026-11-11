import { createElement } from 'react'
import type { RouteObject } from 'react-router-dom'
import { RecipeAssistantSettingsPage } from './screens/RecipeAssistantSettingsPage'

export { RecipeAssistantSettingsPage }

/** The route object WP-F adds to the settings routes; the Settings index row is WP-F too. */
export const recipeAssistantSettingsRoute: RouteObject = {
  path: '/settings/recipe-assistant',
  element: createElement(RecipeAssistantSettingsPage),
}

/** Nothing is registered here: auto-discovery gets an empty list until WP-F wires the route. */
export const routes: RouteObject[] = []
