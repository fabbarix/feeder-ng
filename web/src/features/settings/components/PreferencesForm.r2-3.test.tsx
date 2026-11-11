// R2-3 (F-07, F-03): the unlabelled 48 px accent bar on "Your preferences" looked like a broken button. It becomes a labelled
// preview tile (overline "Preview", a sample chip in the accent) and Save sits in FormActions, auto width.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '../lib/defaults'
import { readSource } from '../../plan/test-css'
import { PreferencesForm } from './PreferencesForm'

describe('PreferencesForm accent preview (F-07)', () => {
  it('is a labelled tile: visible "Preview" text, not aria-hidden, still carrying data-accent', () => {
    render(<PreferencesForm value={DEFAULT_PREFERENCES} onSave={() => {}} />)
    const preview = screen.getByTestId('accent-preview')
    expect(preview).toHaveAttribute('data-accent', DEFAULT_PREFERENCES.accent)
    expect(preview).not.toHaveAttribute('aria-hidden')
    expect(within(preview).getByText('Preview')).toBeVisible()
  })

  it('shows a sample chip inside the preview, so the accent is seen on a real component', () => {
    render(<PreferencesForm value={DEFAULT_PREFERENCES} onSave={() => {}} />)
    expect(within(screen.getByTestId('accent-preview')).getByText('Sample')).toBeInTheDocument()
  })

  it('is no longer the bare 48 px bar (the old .settings__accent-preview rule is gone)', () => {
    const css = readSource('features/settings/settings.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toContain('settings__accent-preview')
    const { container } = render(<PreferencesForm value={DEFAULT_PREFERENCES} onSave={() => {}} />)
    expect(container.querySelector('.settings__accent-preview')).toBeNull()
  })
})

describe('PreferencesForm actions (F-03/F-04)', () => {
  it('puts Save preferences in FormActions', () => {
    render(<PreferencesForm value={DEFAULT_PREFERENCES} onSave={() => {}} />)
    expect(screen.getByRole('button', { name: 'Save preferences' }).closest('.form-actions__primary')).not.toBeNull()
  })
})
