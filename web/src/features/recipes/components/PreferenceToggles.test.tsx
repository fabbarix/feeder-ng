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
})
