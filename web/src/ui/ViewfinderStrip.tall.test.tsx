// beta.7 SR2: `ViewfinderStrip size="tall"` (shop-scan-proposals.md 13.2: 180 px, torch, mute) and its camera states.
// New props: size 'tall'; camera?: 'on' | 'paused' | 'off' (default 'on').
//  - on:     the live <video> (children) with the reticle.
//  - paused: the native Picture camera (or the Price entry) is open: the last frame stays, a status says why, no reads.
//  - off:    no camera (a computer without one): no <video>, the cameraOff glyph, no torch.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ViewfinderStrip } from './ViewfinderStrip'
import { declarations, readUiCss } from './test-utils'

const region = () => screen.getByRole('region', { name: 'Scanner' })

describe('ViewfinderStrip size="tall"', () => {
  it('marks itself tall, keeps the reticle and the Scanner region', () => {
    render(<ViewfinderStrip size="tall" />)
    expect(region()).toHaveAttribute('data-size', 'tall')
    expect(region().querySelector('.viewfinder-strip__reticle')).not.toBeNull()
  })

  it('the default strip and the photo size are unchanged', () => {
    const { rerender } = render(<ViewfinderStrip />)
    expect(region()).not.toHaveAttribute('data-size')
    rerender(<ViewfinderStrip size="photo" />)
    expect(region()).toHaveAttribute('data-size', 'photo')
    expect(region().querySelector('.viewfinder-strip__reticle')).toBeNull()
  })

  it('is 180 px high, the strip stays 140 px', () => {
    const css = readUiCss('ViewfinderStrip.css')
    expect(declarations(css, '.viewfinder-strip__picture').height).toBe('140px')
    expect(declarations(css, ".viewfinder-strip[data-size='tall'] .viewfinder-strip__picture").height).toBe('180px')
  })

  it('has the torch (when supported) and the mute toggle', async () => {
    const onTorch = vi.fn()
    const onMute = vi.fn()
    render(<ViewfinderStrip size="tall" torch={{ supported: true, on: false, onToggle: onTorch }} mute={{ muted: false, onToggle: onMute }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Torch off' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mute beep' }))
    expect(onTorch).toHaveBeenCalledTimes(1)
    expect(onMute).toHaveBeenCalledTimes(1)
  })
})

describe('ViewfinderStrip camera states', () => {
  it('on (default): shows the live video, no state mark, no pause status', () => {
    render(
      <ViewfinderStrip size="tall">
        <video data-testid="cam" />
      </ViewfinderStrip>,
    )
    expect(screen.getByTestId('cam')).toBeInTheDocument()
    expect(region()).toHaveAttribute('data-camera', 'on')
    expect(screen.queryByText('Camera paused')).toBeNull()
  })

  it('paused: keeps the video mounted, says "Camera paused" politely and marks data-camera', () => {
    render(
      <ViewfinderStrip size="tall" camera="paused">
        <video data-testid="cam" />
      </ViewfinderStrip>,
    )
    expect(screen.getByTestId('cam')).toBeInTheDocument()
    expect(region()).toHaveAttribute('data-camera', 'paused')
    const status = screen.getByText('Camera paused')
    expect(status.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite')
  })

  it('paused: an explicit status wins over the default text', () => {
    render(<ViewfinderStrip size="tall" camera="paused" status="Taking a Picture" />)
    expect(screen.getByText('Taking a Picture')).toBeInTheDocument()
    expect(screen.queryByText('Camera paused')).toBeNull()
  })

  it('paused: the torch and the mute stay reachable', () => {
    render(<ViewfinderStrip size="tall" camera="paused" torch={{ supported: true, on: false, onToggle: () => {} }} mute={{ muted: false, onToggle: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Mute beep' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Torch off' })).toBeEnabled()
  })

  it('off (no camera on a computer): no video even if given, the camera-off glyph, the status, no torch, no reticle', () => {
    render(
      <ViewfinderStrip size="tall" camera="off" status="No camera on this computer" torch={{ supported: true, on: false, onToggle: () => {} }} mute={{ muted: false, onToggle: () => {} }}>
        <video data-testid="cam" />
      </ViewfinderStrip>,
    )
    expect(region()).toHaveAttribute('data-camera', 'off')
    expect(screen.queryByTestId('cam')).toBeNull()
    expect(screen.getByText('No camera on this computer')).toBeInTheDocument()
    expect(within(region()).queryByRole('button', { name: /torch/i })).toBeNull()
    expect(region().querySelector('.viewfinder-strip__reticle')).toBeNull()
    expect(region().querySelector('.viewfinder-strip__picture svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('off without a status says "No camera available"', () => {
    render(<ViewfinderStrip size="tall" camera="off" />)
    expect(screen.getByText('No camera available')).toBeInTheDocument()
  })

  it('stays a labelled region in every state (a11y)', () => {
    const { rerender } = render(<ViewfinderStrip size="tall" label="Camera" camera="paused" />)
    expect(screen.getByRole('region', { name: 'Camera' })).toBeInTheDocument()
    rerender(<ViewfinderStrip size="tall" label="Camera" camera="off" />)
    expect(screen.getByRole('region', { name: 'Camera' })).toBeInTheDocument()
  })

  it('shows a paused picture dimmed in CSS, never animated with reduced motion', () => {
    const css = readUiCss('ViewfinderStrip.css')
    expect(css).toMatch(/\[data-camera=['"]paused['"]\]/)
    expect(css).toMatch(/prefers-reduced-motion/)
  })
})
