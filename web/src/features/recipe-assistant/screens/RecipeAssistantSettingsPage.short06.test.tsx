// B9-51 (SHORT-06): the Recipe Assistant's actions float only while there is something to save. Clean, they are the form's last row in flow
// (Cancel and Save disabled, which says the page saves with Save); dirty, the StickyActionBar floats (data-sticky="true"). Focus never moves.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { modelsApi, settingsNoSecretKey, settingsOn } from '../fixtures'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import type { AssistantSettings } from '../types'
import { RecipeAssistantSettingsPage } from './RecipeAssistantSettingsPage'

afterEach(() => vi.unstubAllGlobals())

const SETTINGS = '/api/recipe-assistant/settings'
function open(settings: AssistantSettings = settingsOn, over: Record<string, unknown> = {}) {
  const api = mockApi({ 'GET /api/me': ADMIN_ME, [`GET ${SETTINGS}`]: settings, 'POST /api/recipe-assistant/models': modelsApi, ...over })
  renderWithProviders(<RecipeAssistantSettingsPage />, '/settings/recipe-assistant')
  return api
}
const bar = () => screen.getByRole('group', { name: 'Recipe Assistant actions' })
const url = () => screen.getByLabelText('API base URL')
const edit = async (text: string) => {
  await userEvent.clear(url())
  await userEvent.type(url(), text)
}

describe('the Recipe Assistant actions (SHORT-06)', () => {
  it('are named "Recipe Assistant actions" and hold Cancel then Save', async () => {
    open()
    await screen.findByRole('switch', { name: 'Use the Recipe Assistant' })
    const buttons = [...bar().querySelectorAll('button')].map((b) => b.textContent)
    expect(buttons).toEqual(['Cancel', 'Save'])
  })

  it('clean: the bar does not float, and both buttons are disabled', async () => {
    open()
    await screen.findByRole('switch', { name: 'Use the Recipe Assistant' })
    expect(bar()).toHaveAttribute('data-sticky', 'false')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('clean: the actions are the last thing of the form, after the Recent changes tile (in flow)', async () => {
    open()
    await screen.findByRole('switch', { name: 'Use the Recipe Assistant' })
    const recent = screen.getByRole('region', { name: 'Recent changes' })
    expect(recent.compareDocumentPosition(bar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('dirty: the bar floats and both buttons are enabled; focus stays where it was', async () => {
    open()
    await screen.findByRole('switch', { name: 'Use the Recipe Assistant' })
    await userEvent.click(url())
    await edit('https://gateway.example.test')
    expect(bar()).toHaveAttribute('data-sticky', 'true')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(url()).toHaveFocus()
  })

  it('Cancel puts the bar back in the flow, with the buttons disabled again', async () => {
    open()
    await screen.findByRole('switch', { name: 'Use the Recipe Assistant' })
    await edit('https://gateway.example.test')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(bar()).toHaveAttribute('data-sticky', 'false')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('a saved change puts the bar back in the flow', async () => {
    open(settingsOn, { [`PUT ${SETTINGS}`]: { ...settingsOn, enabled: false } })
    await userEvent.click(await screen.findByRole('switch', { name: 'Use the Recipe Assistant' }))
    expect(bar()).toHaveAttribute('data-sticky', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(bar()).toHaveAttribute('data-sticky', 'false'))
  })

  it('without the server secret key nothing can change, so the bar stays in the flow', async () => {
    open(settingsNoSecretKey)
    await screen.findByRole('switch', { name: 'Use the Recipe Assistant' })
    expect(bar()).toHaveAttribute('data-sticky', 'false')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
