import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ACCENT_PRESETS } from '../lib/accents'
import { DEFAULT_PREFERENCES } from '../lib/defaults'
import type { Preferences } from '../types'
import { PreferencesForm } from './PreferencesForm'

const save = () => screen.getByRole('button', { name: 'Save preferences' })

function setup(value: Preferences = DEFAULT_PREFERENCES) {
  const onSave = vi.fn()
  render(<PreferencesForm value={value} onSave={onSave} />)
  return onSave
}

describe('PreferencesForm', () => {
  it('shows the current choices in Segmented controls (radiogroups of 2-3 short options)', () => {
    setup({ scheme: 'dark', accent: '#3366cc', units: 'imperial' })
    expect(screen.getByRole('radiogroup', { name: 'Colour mode' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Imperial' })).toBeChecked()
    // not a preset: the Custom swatch is the checked one
    expect(within(screen.getByRole('radiogroup', { name: 'Accent colour' })).getByRole('radio', { name: 'Custom' })).toBeChecked()
  })

  it('has no native control (no radio/colour/checkbox input)', () => {
    setup()
    expect(document.querySelector('input[type=color], input[type=radio], input[type=checkbox], select')).toBeNull()
  })

  it('shows a live preview tile in the chosen accent', async () => {
    setup()
    const preview = screen.getByTestId('accent-preview')
    expect(preview).toHaveAttribute('data-accent', DEFAULT_PREFERENCES.accent)
    await userEvent.click(screen.getByRole('radio', { name: ACCENT_PRESETS[1]!.name }))
    expect(screen.getByTestId('accent-preview')).toHaveAttribute('data-accent', ACCENT_PRESETS[1]!.hex)
  })

  it('defaults to system mode and metric', () => {
    setup()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Metric' })).toBeChecked()
  })

  it('has nothing to save until something changes', async () => {
    setup()
    expect(save()).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(save()).toBeEnabled()
  })

  it('saves a new colour mode and units', async () => {
    const onSave = setup()
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_PREFERENCES, scheme: 'dark', units: 'imperial' })
  })

  it('picks an accent from the presets', async () => {
    const onSave = setup()
    const preset = ACCENT_PRESETS[1]!
    await userEvent.click(screen.getByRole('radio', { name: preset.name }))
    expect(screen.getByRole('radio', { name: preset.name })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: ACCENT_PRESETS[0]!.name })).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_PREFERENCES, accent: preset.hex })
  })

  it('takes a custom accent', async () => {
    const onSave = setup()
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Custom colour' })
    const hex = within(dialog).getByLabelText('Hex colour')
    await userEvent.clear(hex)
    await userEvent.type(hex, '#aa3366')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use colour' }))
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_PREFERENCES, accent: '#aa3366' })
  })

  it('has no secondary colour control (removed 2026-11-10)', () => {
    setup()
    expect(screen.queryByRole('checkbox', { name: /secondary/i })).toBeNull()
    expect(screen.queryByRole('switch', { name: /secondary/i })).toBeNull()
    expect(screen.queryByLabelText(/secondary/i)).toBeNull()
    expect(screen.queryByText(/secondary/i)).toBeNull()
  })

  it('saves only scheme, accent and units', async () => {
    const onSave = setup()
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    await userEvent.click(save())
    const saved = onSave.mock.calls[0]![0] as Record<string, unknown>
    expect(Object.keys(saved).sort()).toEqual(['accent', 'scheme', 'units'])
  })
})
