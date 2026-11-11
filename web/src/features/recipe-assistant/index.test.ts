// The feature index exposes the page and its route definition, but registers NO route itself: the Settings index row
// and route registration are WP-F (team A1 is editing settings now).
import { describe, expect, it } from 'vitest'
import { RecipeAssistantSettingsPage, recipeAssistantSettingsRoute, routes } from './index'

describe('recipe-assistant feature index', () => {
  it('exports the page component', () => expect(typeof RecipeAssistantSettingsPage).toBe('function'))
  it('exports the route definition for /settings/recipe-assistant, with the page as its element', () => {
    expect(recipeAssistantSettingsRoute.path).toBe('/settings/recipe-assistant')
    expect(recipeAssistantSettingsRoute.element).toBeTruthy()
  })
  it('auto-discovery gets an empty routes list for now (WP-F adds the route to the settings routes)', () => expect(routes).toEqual([]))
})
