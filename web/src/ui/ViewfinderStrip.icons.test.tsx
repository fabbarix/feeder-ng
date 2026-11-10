import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { ViewfinderStrip } from './ViewfinderStrip'
import { readUiCss } from './test-utils'

const glyph = (name: 'torch' | 'mute') => {
  const { container, unmount } = render(<Icon name={name} size={20} />)
  const html = container.querySelector('svg')?.innerHTML ?? ''
  unmount()
  return html
}

describe('WP3b #16: ViewfinderStrip uses IconButton, not legacy Buttons', () => {
  const onToggle = () => {}
  it('torch and mute are icon-only buttons (IconButton), never .button', () => {
    const { container } = render(<ViewfinderStrip torch={{ supported: true, on: false, onToggle }} mute={{ muted: false, onToggle }} />)
    expect(container.querySelectorAll('.icon-button')).toHaveLength(2)
    expect(container.querySelector('.button')).toBeNull()
    expect(container.querySelector('[data-variant="tonal"], [data-variant="ghost"]')).toBeNull()
  })

  it('the buttons show the torch / mute glyphs and no visible text', () => {
    render(<ViewfinderStrip torch={{ supported: true, on: false, onToggle }} mute={{ muted: false, onToggle }} />)
    const torch = screen.getByRole('button', { name: 'Torch off' })
    const mute = screen.getByRole('button', { name: 'Mute beep' })
    expect(torch.querySelector('svg')?.innerHTML).toBe(glyph('torch'))
    expect(mute.querySelector('svg')?.innerHTML).toBe(glyph('mute'))
    expect(torch.textContent).toBe('')
    expect(mute.textContent).toBe('')
  })

  it('keeps the state names and aria-pressed (existing contract)', () => {
    render(<ViewfinderStrip torch={{ supported: true, on: true, onToggle }} mute={{ muted: true, onToggle }} />)
    expect(screen.getByRole('button', { name: 'Torch on' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Unmute beep' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('the stylesheet carries no legacy button styling', () => {
    expect(readUiCss('ViewfinderStrip.css')).not.toMatch(/\.button\b/)
  })
})
