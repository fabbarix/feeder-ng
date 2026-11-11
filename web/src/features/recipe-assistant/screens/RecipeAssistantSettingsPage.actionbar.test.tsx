// R2-3 send-back: the Settings actions are the shared StickyActionBar (column "narrow"), not a local sticky div that sat under the
// phone bottom bar and let the model Select paint over it. The local SettingsActions / .ra__actions are gone.
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rule, stylesheet } from '../../../test/cssRules'
import { settingsOn } from '../fixtures'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import { RecipeAssistantSettingsPage } from './RecipeAssistantSettingsPage'

afterEach(() => vi.unstubAllGlobals())

describe('Recipe Assistant settings actions', () => {
  it('are in a StickyActionBar aligned to the narrow form column, holding Cancel and Save', async () => {
    mockApi({ 'GET /api/me': ADMIN_ME, 'GET /api/recipe-assistant/settings': settingsOn, 'POST /api/recipe-assistant/models': { models: [] } })
    renderWithProviders(<RecipeAssistantSettingsPage />, '/settings/recipe-assistant')
    await screen.findByRole('switch', { name: 'Use the Recipe Assistant' })
    const bar = screen.getByRole('group', { name: 'Settings actions' })
    expect(bar).toHaveClass('sticky-action-bar')
    expect(bar).toHaveAttribute('data-column', 'narrow')
    expect(bar.querySelector('.form-actions')).not.toBeNull()
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Cancel' }))
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Save' }))
    expect(document.querySelector('.ra__actions')).toBeNull()
  })
  it('the stylesheet has no local sticky bar left', () => {
    const { css, base } = stylesheet('src/features/recipe-assistant/recipe-assistant.css')
    expect(css).not.toContain('ra__actions')
    for (const sel of ['.ra']) expect(rule(base, sel)['position']).toBeUndefined()
  })
})
