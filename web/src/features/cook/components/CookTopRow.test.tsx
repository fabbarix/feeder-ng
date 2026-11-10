import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookTopRow } from './CookTopRow'

const base = { number: 1, of: 5, speechSupported: true, voiceOn: false, onVoiceChange: () => {}, onExit: () => {} }

describe('CookTopRow (2.7)', () => {
  it('has an Exit button that leaves Cook Mode', async () => {
    const onExit = vi.fn()
    render(<CookTopRow {...base} onExit={onExit} />)
    await userEvent.click(screen.getByRole('button', { name: 'Exit' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('shows the Step pill, announced as a status', () => {
    render(<CookTopRow {...base} number={2} of={5} />)
    expect(screen.getByRole('status')).toHaveTextContent('Step 2 of 5')
  })

  // R11b N9: indigo (the Pinned state chip) means Pinned; the progress pill is a neutral tag.
  it('the Step pill is not the Pinned chip: a neutral tag chip, no status colour', () => {
    render(<CookTopRow {...base} number={2} of={5} />)
    const chip = screen.getByRole('status').querySelector('.chip')!
    expect(chip).not.toHaveAttribute('data-status', 'pinned')
    expect(chip).not.toHaveAttribute('data-kind', 'state')
    expect(chip).toHaveAttribute('data-kind', 'tag')
  })

  it('leaves the pill out when there are no Steps', () => {
    render(<CookTopRow {...base} number={0} of={0} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('has the voice switch as an icon button, not a chip', async () => {
    const onVoiceChange = vi.fn()
    render(<CookTopRow {...base} onVoiceChange={onVoiceChange} />)
    const voice = screen.getByRole('button', { name: 'Voice commands' })
    expect(voice).toHaveClass('icon-button')
    expect(voice).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(voice)
    expect(onVoiceChange).toHaveBeenCalledWith(true)
  })

  it('has no Screen-stays-awake chip', () => {
    render(<CookTopRow {...base} />)
    expect(screen.queryByText('Screen stays awake')).not.toBeInTheDocument()
  })
})
