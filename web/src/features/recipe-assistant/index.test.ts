// The feature index exposes the page and its route definition, but registers NO route itself: the Settings index row
// and route registration are WP-F (team A1 is editing settings now).
import { describe, expect, it } from 'vitest'
import { chunkOfElement } from '../../app/lazyScreen'
import { recipeAssistantSettingsRoute, routes } from './index'
import { RecipeAssistantSettingsPage } from './screens/RecipeAssistantSettingsPage'

describe('recipe-assistant feature index', () => {
  // B9-59: the page loads on demand, so the index no longer re-exports it (a static re-export would pull it into the entry
  // chunk); the route's chunk resolves to it.
  it('the route loads the page component', async () => expect(await chunkOfElement(recipeAssistantSettingsRoute.element)?.load()).toBe(RecipeAssistantSettingsPage))
  it('exports the route definition for /settings/recipe-assistant, with the page as its element', () => {
    expect(recipeAssistantSettingsRoute.path).toBe('/settings/recipe-assistant')
    expect(recipeAssistantSettingsRoute.element).toBeTruthy()
  })
  it('auto-discovery gets an empty routes list for now (WP-F adds the route to the settings routes)', () => expect(routes).toEqual([]))
})
