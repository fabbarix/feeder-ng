// B9-36 (SAFE-08, decision SAFE 6 B): Your preferences previews every choice across the whole app, Save is explicit, and leaving with a
// preview asks first (Sign out included, see app/YourMenu.signOutGuard.test.tsx). Chapter scenarios, by title:
//   "Choosing Dark previews the whole app before saving"; "Leaving with a preview asks first and Discard puts the saved look back";
//   "A reload drops an unsaved preview" (the preview is in memory only: a fresh mount starts clean); "Save keeps the preferences on every device"
//   (the API half is bdd/features/household/preferences.feature).
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Link } from 'react-router-dom'
import { PreferenceThemeProvider } from '../components/PreferenceThemeProvider'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { preferencePreview } from '../lib/preferencePreview'
import { mockApi, renderWithDataRouter, USER_ME } from '../test-utils'
import { PreferencesPage } from './PreferencesPage'

const saved = { scheme: 'system', accent: '#3f7d58', units: 'metric' }

function Elsewhere() {
  const units = useDisplayUnitSystem()
  return <p data-testid="units-elsewhere">{units}</p>
}
function Shell() {
  return (
    <PreferenceThemeProvider>
      <PreferencesPage />
      <Elsewhere />
      <Link to="/plan">Plan</Link>
    </PreferenceThemeProvider>
  )
}
const scheme = () => document.documentElement.dataset.scheme

function mount(extra: Record<string, unknown> = {}) {
  const api = mockApi({ 'GET /api/me': USER_ME, 'GET /api/me/preferences': saved, 'PUT /api/me/preferences': (c: { body: object }) => c.body, ...extra })
  const view = renderWithDataRouter(<Shell />, '/settings/preferences')
  return { api, ...view }
}
const puts = (api: ReturnType<typeof mockApi>) => api.calls.filter((c) => c.method === 'PUT')

beforeEach(() => vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })))
afterEach(() => {
  preferencePreview.clear()
  preferencePreview.setLeaveCheck(null)
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-scheme')
})

const pick = async (name: string) => userEvent.click(await screen.findByRole('radio', { name }))

describe('Your preferences: the preview', () => {
  it('Choosing Dark previews the whole app before saving: the document is dark and nothing was sent', async () => {
    const { api } = mount()
    await pick('Dark')
    await waitFor(() => expect(scheme()).toBe('dark'))
    expect(puts(api)).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Not saved yet: Dark is a preview. Save it or put back System.')
  })

  it('Choosing Imperial changes the units of every consumer elsewhere in the app', async () => {
    mount()
    expect(await screen.findByTestId('units-elsewhere')).toHaveTextContent('metric')
    await pick('Imperial')
    expect(screen.getByTestId('units-elsewhere')).toHaveTextContent('imperial')
  })

  it('choosing an accent previews the theme variables', async () => {
    mount()
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--color-primary')).not.toBe(''))
    const before = document.documentElement.style.getPropertyValue('--color-primary')
    await pick('Tomato')
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--color-primary')).not.toBe(before))
  })

  it('Revert puts the saved values back at once: the app is light again and the bar goes', async () => {
    const { api, container } = mount()
    await pick('Dark')
    await waitFor(() => expect(scheme()).toBe('dark'))
    await userEvent.click(screen.getByRole('button', { name: 'Revert' }))
    await waitFor(() => expect(scheme()).toBe('light'))
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(preferencePreview.get()).toBeNull()
    expect(container.querySelector('.sticky-action-bar')).toBeNull()
    expect(puts(api)).toHaveLength(0)
  })

  it('Save PUTs the whole preference once, clears the preview, settles the bar and says "Your preferences are saved"', async () => {
    const { api, container } = mount()
    await pick('Dark')
    await pick('Imperial')
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await waitFor(() => expect(puts(api)).toHaveLength(1))
    expect(puts(api)[0]!.body).toEqual({ scheme: 'dark', accent: '#3f7d58', units: 'imperial' })
    expect(await screen.findByText('Your preferences are saved')).toBeInTheDocument()
    await waitFor(() => expect(preferencePreview.get()).toBeNull())
    expect(screen.queryByText(/Not saved yet/)).toBeNull()
    expect(container.querySelector('.sticky-action-bar')).toBeNull()
    expect(scheme()).toBe('dark') // now the saved value
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
  })

  it('a failed Save keeps the preview, keeps the bar and says so once (B9-20 wording)', async () => {
    const { api } = mount({ 'PUT /api/me/preferences': { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    await pick('Dark')
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(await screen.findByText('Couldn’t save your preferences')).toBeInTheDocument()
    expect(puts(api)).toHaveLength(1)
    expect(scheme()).toBe('dark')
    expect(preferencePreview.get()).toEqual({ ...saved, scheme: 'dark' })
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeEnabled()
    expect(screen.getByText(/Not saved yet/)).toBeInTheDocument()
  })

  it('leaving the page ends the preview (unmount clears it)', async () => {
    const { unmount } = mount()
    await pick('Dark')
    expect(preferencePreview.get()).not.toBeNull()
    unmount()
    expect(preferencePreview.get()).toBeNull()
  })

  it('A reload drops an unsaved preview: a fresh page starts from the saved preferences', async () => {
    const first = mount()
    await pick('Dark')
    first.unmount()
    mount()
    expect(await screen.findByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.queryByText(/Not saved yet/)).toBeNull()
  })

  it('shows the intro line and no preview tile', async () => {
    mount()
    expect(await screen.findByText(/You see each choice across the app at once/)).toBeInTheDocument()
    expect(screen.queryByTestId('accent-preview')).toBeNull()
  })
})

describe('Your preferences: the "Leave without saving?" guard', () => {
  const dialog = () => screen.findByRole('dialog', { name: 'Leave without saving?' })

  it('Leaving with a preview asks first: Keep editing is focused, there is no Close, and the preview stays', async () => {
    const { router } = mount()
    await pick('Dark')
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    const d = await dialog()
    expect(within(d).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    expect(within(d).queryByRole('button', { name: /^Close/ })).toBeNull()
    await userEvent.click(within(d).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe('/settings/preferences')
    expect(scheme()).toBe('dark')
    expect(preferencePreview.get()).not.toBeNull()
  })

  it('Discard changes puts the saved look back and then leaves', async () => {
    const { router } = mount()
    await pick('Dark')
    await waitFor(() => expect(scheme()).toBe('dark'))
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))
    expect(preferencePreview.get()).toBeNull()
    expect(scheme()).toBe('light')
  })

  it('a clean page leaves without a question', async () => {
    const { router } = mount()
    await screen.findByRole('radio', { name: 'System' })
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('after a successful Save the page is clean again and leaving does not ask', async () => {
    const { router } = mount()
    await pick('Dark')
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await screen.findByText('Your preferences are saved')
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/plan'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // Decision SAFE 6 (main-session ruling 3): the body names what is previewed and what comes back, not the shared fixed copy.
  it('names what is previewed and what comes back ("Dark is only a preview." / "If you leave, Feeder goes back to System.")', async () => {
    mount()
    await pick('Dark')
    await userEvent.click(screen.getByRole('link', { name: 'Plan' }))
    const d = await dialog()
    expect(within(d).getByText('Dark is only a preview.')).toBeInTheDocument()
    expect(within(d).getByText('If you leave, Feeder goes back to System.')).toBeInTheDocument()
    expect(d).not.toHaveTextContent('Your changes to your preferences are not saved.')
  })

  it('registers its check for Sign out while dirty, and unregisters it when clean or gone', async () => {
    const { unmount } = mount()
    await screen.findByRole('radio', { name: 'System' })
    await expect(preferencePreview.confirmLeave()).resolves.toBe(true) // clean: no question
    await pick('Dark')
    const asked = preferencePreview.confirmLeave()
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Keep editing' }))
    await expect(asked).resolves.toBe(false)
    const again = preferencePreview.confirmLeave()
    await userEvent.click(within(await dialog()).getByRole('button', { name: 'Discard changes' }))
    await expect(again).resolves.toBe(true)
    expect(preferencePreview.get()).toBeNull()
    unmount()
    await expect(preferencePreview.confirmLeave()).resolves.toBe(true)
  })
})
