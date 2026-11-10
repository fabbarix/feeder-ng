import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PreferenceToggles } from './PreferenceToggles'

describe('PreferenceToggles', () => {
  it('shows the current state as the one pressed toggle', () => {
    render(<PreferenceToggles state="dislike" onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Dislike' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Favourite' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Exclusion' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tapping another toggle replaces the state', async () => {
    const onChange = vi.fn()
    render(<PreferenceToggles state="none" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Favourite' }))
    expect(onChange).toHaveBeenCalledWith('favourite')
  })

  it('tapping the pressed toggle clears it', async () => {
    const onChange = vi.fn()
    render(<PreferenceToggles state="exclusion" onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Exclusion' }))
    expect(onChange).toHaveBeenCalledWith('none')
  })

  it('can be disabled until a Member is chosen', async () => {
    const onChange = vi.fn()
    render(<PreferenceToggles state="none" disabled onChange={onChange} />)
    const favourite = screen.getByRole('button', { name: 'Favourite' })
    expect(favourite).toBeDisabled()
    await userEvent.click(favourite)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses filter Chips with an icon each, not the deprecated tone prop', () => {
    const { container } = render(<PreferenceToggles state="favourite" onChange={() => {}} />)
    for (const chip of container.querySelectorAll('button')) {
      expect(chip.querySelector('svg')).not.toBeNull()
      expect(chip).not.toHaveAttribute('data-tone')
    }
  })
})
