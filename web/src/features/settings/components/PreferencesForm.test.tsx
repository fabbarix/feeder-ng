// B9-36 (SAFE-08, decision SAFE 6 B): Your preferences is render-only: every choice goes up through onChange (the page previews it across the
// app), the sticky bar exists only while the form is dirty, and Revert and Save sit side by side in the group "Preferences actions".
// The small preview tile is gone (the app itself is the preview). This file replaces PreferencesForm.test.tsx and .r2-3.test.tsx.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ACCENT_PRESETS } from '../lib/accents'
import { DEFAULT_PREFERENCES } from '../lib/defaults'
import { readSource } from '../../plan/test-css'
import type { Preferences } from '../types'
import { PreferencesForm } from './PreferencesForm'

const SAVED: Preferences = DEFAULT_PREFERENCES // system, Basil, metric
const save = () => screen.getByRole('button', { name: 'Save preferences' })
const revert = () => screen.getByRole('button', { name: 'Revert' })

/** The page's part: it holds the effective value and previews every change, as usePreferencesPage does. */
function Harness({ saved = SAVED, initial = SAVED, onSave = vi.fn(), onRevert = vi.fn(), saving }: { saved?: Preferences; initial?: Preferences; onSave?: () => void; onRevert?: () => void; saving?: boolean }) {
  const [value, setValue] = useState(initial)
  const dirty = JSON.stringify(value).toLowerCase() !== JSON.stringify(saved).toLowerCase()
  return (
    <PreferencesForm
      value={value}
      saved={saved}
      dirty={dirty}
      saving={saving}
      onChange={setValue}
      onSave={onSave as never}
      onRevert={() => {
        onRevert()
        setValue(saved)
      }}
    />
  )
}

describe('PreferencesForm', () => {
  it('shows the current choices in Segmented controls and the accent swatches', () => {
    render(<Harness saved={{ scheme: 'dark', accent: '#3366cc', units: 'imperial' }} initial={{ scheme: 'dark', accent: '#3366cc', units: 'imperial' }} />)
    expect(screen.getByRole('radiogroup', { name: 'Colour mode' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Units' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Imperial' })).toBeChecked()
    expect(within(screen.getByRole('radiogroup', { name: 'Accent colour' })).getByRole('radio', { name: 'Custom' })).toBeChecked()
  })

  it('has no native control (no radio, colour, checkbox or select element)', () => {
    render(<Harness />)
    expect(document.querySelector('input[type=color], input[type=radio], input[type=checkbox], select')).toBeNull()
  })

  it('says each choice shows across the app at once, and what Save does', () => {
    render(<Harness />)
    expect(screen.getByText('You see each choice across the app at once. Save keeps it on every phone and computer you sign in on.')).toBeInTheDocument()
  })

  it('the preview tile is gone: no "Preview" overline, no Sample chip, no accent-preview', () => {
    const { container } = render(<Harness />)
    expect(screen.queryByTestId('accent-preview')).toBeNull()
    expect(screen.queryByText('Sample')).toBeNull()
    expect(container.querySelector('.settings__preview')).toBeNull()
    const css = readSource('features/settings/settings.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toContain('settings__preview')
  })

  it('every choice is handed up at once: Dark, Imperial and an accent (nothing waits for Save)', async () => {
    const onChange = vi.fn()
    render(<PreferencesForm value={SAVED} saved={SAVED} dirty={false} onChange={onChange} onSave={() => {}} onRevert={() => {}} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...SAVED, scheme: 'dark' })
    await userEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...SAVED, units: 'imperial' })
    await userEvent.click(screen.getByRole('radio', { name: ACCENT_PRESETS[1]!.name }))
    expect(onChange).toHaveBeenLastCalledWith({ ...SAVED, accent: ACCENT_PRESETS[1]!.hex })
  })

  it('takes a custom accent', async () => {
    const onChange = vi.fn()
    render(<PreferencesForm value={SAVED} saved={SAVED} dirty={false} onChange={onChange} onSave={() => {}} onRevert={() => {}} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const dialog = screen.getByRole('dialog', { name: 'Custom colour' })
    const hex = within(dialog).getByLabelText('Hex colour')
    await userEvent.clear(hex)
    await userEvent.type(hex, '#aa3366')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use colour' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...SAVED, accent: '#aa3366' })
  })
})

describe('PreferencesForm actions: Revert and Save', () => {
  it('while clean: the group "Preferences actions" sits in the flow with both buttons disabled, and there is no sticky bar', () => {
    const { container } = render(<Harness />)
    const group = screen.getByRole('group', { name: 'Preferences actions' })
    expect(within(group).getByRole('button', { name: 'Revert' })).toBeDisabled()
    expect(within(group).getByRole('button', { name: 'Save preferences' })).toBeDisabled()
    expect(group.closest('.sticky-action-bar')).toBeNull()
    expect(container.querySelector('.sticky-action-bar')).toBeNull()
  })

  it('while dirty: the same group is the sticky bar, Revert (outline) then Save preferences (primary), side by side and enabled', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    const group = screen.getByRole('group', { name: 'Preferences actions' })
    expect(group.closest('.sticky-action-bar') ?? group).toHaveClass('sticky-action-bar')
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Revert', 'Save preferences'])
    expect(buttons[0]).toHaveAttribute('data-variant', 'secondary')
    expect(buttons[1]).toHaveAttribute('data-variant', 'primary')
    expect(buttons[0]).toBeEnabled()
    expect(buttons[1]).toBeEnabled()
  })

  it('the sticky bar goes again once the choices are back to the saved ones', async () => {
    const { container } = render(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(container.querySelector('.sticky-action-bar')).not.toBeNull()
    await userEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(container.querySelector('.sticky-action-bar')).toBeNull()
    expect(save()).toBeDisabled()
  })

  it('Revert asks the page to put the saved values back', async () => {
    const onRevert = vi.fn()
    render(<Harness onRevert={onRevert} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    await userEvent.click(revert())
    expect(onRevert).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
  })

  it('Save hands up the choices once', async () => {
    const onSave = vi.fn()
    render(<PreferencesForm value={{ ...SAVED, scheme: 'dark' }} saved={SAVED} dirty onChange={() => {}} onSave={onSave} onRevert={() => {}} />)
    await userEvent.click(save())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ ...SAVED, scheme: 'dark' })
  })

  it('Enter in the form saves like the button (it is a real form with a submit button)', () => {
    render(<PreferencesForm value={{ ...SAVED, scheme: 'dark' }} saved={SAVED} dirty onChange={() => {}} onSave={() => {}} onRevert={() => {}} />)
    expect(save()).toHaveAttribute('type', 'submit')
    expect(save().closest('form')).not.toBeNull()
    expect(revert()).toHaveAttribute('type', 'button')
  })

  it('a save in flight shows the spinner on Save and disables it', () => {
    render(<PreferencesForm value={{ ...SAVED, scheme: 'dark' }} saved={SAVED} dirty saving onChange={() => {}} onSave={() => {}} onRevert={() => {}} />)
    expect(save()).toBeDisabled()
  })
})

describe('PreferencesForm "Not saved yet" line', () => {
  it('is absent while clean', () => {
    render(<Harness />)
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/Not saved yet/)).toBeNull()
  })

  it('is a role=status line in the info tone naming what is previewed and what returns', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    const line = screen.getByRole('status')
    expect(line).toHaveTextContent('Not saved yet: Dark is a preview. Save it or put back System.')
    expect(line).toHaveAttribute('data-tone', 'info')
  })

  it('changes its text with the choices (several changes: no put-back clause)', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Tomato' }))
    expect(screen.getByRole('status')).toHaveTextContent('Not saved yet: Dark and Tomato are a preview.')
  })
})
