import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VoiceToggle } from './VoiceToggle'

describe('VoiceToggle', () => {
  it('shows off by default and switches on when pressed', async () => {
    const onChange = vi.fn()
    render(<VoiceToggle supported enabled={false} onChange={onChange} />)
    const b = screen.getByRole('button', { name: 'Voice commands' })
    expect(b).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(b)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('switches off when pressed while on', async () => {
    const onChange = vi.fn()
    render(<VoiceToggle supported enabled onChange={onChange} />)
    const b = screen.getByRole('button', { name: 'Voice commands' })
    expect(b).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(b)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('is disabled where the browser has no speech recognition', () => {
    render(<VoiceToggle supported={false} enabled={false} onChange={() => {}} />)
    const b = screen.getByRole('button', { name: 'Voice commands' })
    expect(b).toBeDisabled()
    expect(b).toHaveAccessibleDescription('Voice commands are not available in this browser')
  })

  it('keeps one stable name whatever the state; aria-pressed carries it', () => {
    const { rerender } = render(<VoiceToggle supported enabled={false} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Voice commands', pressed: false })).not.toHaveAccessibleDescription()
    rerender(<VoiceToggle supported enabled onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Voice commands', pressed: true })).toBeInTheDocument()
  })
})

describe('VoiceToggle look (2.7)', () => {
  it('is an IconButton (microphone), pressed while on, never a Chip', () => {
    render(<VoiceToggle supported enabled onChange={() => {}} />)
    const b = screen.getByRole('button', { name: 'Voice commands' })
    expect(b).toHaveClass('icon-button')
    expect(b.textContent).toBe('')
  })
})
