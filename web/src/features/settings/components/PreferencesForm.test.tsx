import { fireEvent, render, screen } from '@testing-library/react'
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
  it('shows the current choices', () => {
    setup({ scheme: 'dark', accent: '#3366cc', secondary: null, units: 'imperial' })
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Imperial' })).toBeChecked()
    expect(screen.getByLabelText('Custom accent colour')).toHaveValue('#3366cc')
    expect(screen.getByRole('checkbox', { name: 'Use a secondary colour' })).not.toBeChecked()
    expect(screen.queryByLabelText('Secondary colour')).toBeNull()
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
    await userEvent.click(screen.getByRole('button', { name: preset.name }))
    expect(screen.getByRole('button', { name: preset.name })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: ACCENT_PRESETS[0]!.name })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_PREFERENCES, accent: preset.hex })
  })

  it('takes a custom accent', async () => {
    const onSave = setup()
    fireEvent.change(screen.getByLabelText('Custom accent colour'), { target: { value: '#aa3366' } })
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledWith({ ...DEFAULT_PREFERENCES, accent: '#aa3366' })
  })

  it('adds, edits and drops the optional secondary colour', async () => {
    const onSave = setup()
    await userEvent.click(screen.getByRole('checkbox', { name: 'Use a secondary colour' }))
    const secondary = screen.getByLabelText('Secondary colour')
    // jest-dom's toHaveValue cannot take an asymmetric matcher, so compare the string directly.
    expect((secondary as HTMLInputElement).value).toMatch(/^#[0-9a-f]{6}$/i)
    fireEvent.change(secondary, { target: { value: '#ffb4a2' } })
    await userEvent.click(save())
    expect(onSave).toHaveBeenLastCalledWith({ ...DEFAULT_PREFERENCES, secondary: '#ffb4a2' })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Use a secondary colour' }))
    expect(screen.queryByLabelText('Secondary colour')).toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' })) // make the form dirty again
    await userEvent.click(save())
    expect(onSave).toHaveBeenLastCalledWith({ ...DEFAULT_PREFERENCES, scheme: 'dark', secondary: null })
  })
})
