import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VoiceToggle } from './VoiceToggle'

describe('VoiceToggle', () => {
  it('shows off by default and switches on when pressed', async () => {
    const onChange = vi.fn()
    render(<VoiceToggle supported enabled={false} onChange={onChange} />)
    const b = screen.getByRole('button', { name: 'Voice commands off' })
    expect(b).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(b)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('switches off when pressed while on', async () => {
    const onChange = vi.fn()
    render(<VoiceToggle supported enabled onChange={onChange} />)
    const b = screen.getByRole('button', { name: 'Voice commands on' })
    expect(b).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(b)
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('is disabled where the browser has no speech recognition', () => {
    render(<VoiceToggle supported={false} enabled={false} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: 'Voice commands are not available in this browser' })).toBeDisabled()
  })
})

describe('VoiceToggle look (2.7)', () => {
  it('is an IconButton (microphone), pressed while on, never a Chip', () => {
    render(<VoiceToggle supported enabled onChange={() => {}} />)
    const b = screen.getByRole('button', { name: 'Voice commands on' })
    expect(b).toHaveClass('icon-button')
    expect(b.textContent).toBe('')
  })
})
