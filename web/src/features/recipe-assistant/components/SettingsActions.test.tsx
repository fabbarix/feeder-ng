// The interim sticky action bar (ui-review-2 L-03): one small local component until ui/StickyActionBar lands.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsActions } from './SettingsActions'

describe('SettingsActions', () => {
  it('has a tertiary Cancel and a primary Save', () => {
    render(<SettingsActions dirty canSave saving={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
  it('Cancel and Save are disabled while nothing changed', () => {
    render(<SettingsActions dirty={false} canSave={false} saving={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
  it('calls the handlers', async () => {
    const onSave = vi.fn()
    const onCancel = vi.fn()
    render(<SettingsActions dirty canSave saving={false} onSave={onSave} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
  it('while saving, Save says so and cannot be pressed twice', async () => {
    const onSave = vi.fn()
    render(<SettingsActions dirty canSave saving onSave={onSave} onCancel={vi.fn()} />)
    const save = screen.getByRole('button', { name: /Saving/ })
    expect(save).toBeDisabled()
    await userEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })
  it('is a labelled group of actions', () => {
    render(<SettingsActions dirty canSave saving={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Settings actions' })).toBeInTheDocument()
  })
})
