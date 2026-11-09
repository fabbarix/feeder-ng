import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ViewfinderStrip } from './ViewfinderStrip'

describe('ViewfinderStrip', () => {
  it('is a labelled region around the camera', () => {
    render(
      <ViewfinderStrip>
        <video data-testid="cam" />
      </ViewfinderStrip>,
    )
    expect(screen.getByRole('region', { name: 'Scanner' })).toContainElement(screen.getByTestId('cam'))
  })

  it('shows a status line over the picture', () => {
    render(<ViewfinderStrip status="Starting the camera" />)
    expect(screen.getByText('Starting the camera')).toBeInTheDocument()
  })

  it('has a torch button only when the camera supports one', () => {
    const { rerender } = render(<ViewfinderStrip torch={{ supported: false, on: false, onToggle: () => {} }} />)
    expect(screen.queryByRole('button', { name: /torch/i })).toBeNull()
    rerender(<ViewfinderStrip torch={{ supported: true, on: false, onToggle: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Torch off' })).toHaveAttribute('aria-pressed', 'false')
    rerender(<ViewfinderStrip torch={{ supported: true, on: true, onToggle: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Torch on' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('toggles the torch and the mute', async () => {
    const onTorch = vi.fn()
    const onMute = vi.fn()
    render(<ViewfinderStrip torch={{ supported: true, on: false, onToggle: onTorch }} mute={{ muted: false, onToggle: onMute }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Torch off' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mute beep' }))
    expect(onTorch).toHaveBeenCalledTimes(1)
    expect(onMute).toHaveBeenCalledTimes(1)
  })

  it('names the mute button by its state', () => {
    render(<ViewfinderStrip mute={{ muted: true, onToggle: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Unmute beep' })).toHaveAttribute('aria-pressed', 'true')
  })
})
