// B9-01 / DS-12 R-B: ui/CloseButton is a 40 px circle with a 20 px X, named "Close", never squashed.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CloseButton } from './CloseButton'
import { declarations, readUiCss } from './test-utils'

describe('CloseButton', () => {
  it('is a button named Close that calls onClick', async () => {
    const onClick = vi.fn()
    render(<CloseButton onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('takes a custom accessible name', () => {
    render(<CloseButton label="Close the filters" />)
    expect(screen.getByRole('button', { name: 'Close the filters' })).toBeInTheDocument()
  })

  it('has type="button", the .close-button class, and a decorative 20 px icon', () => {
    render(<CloseButton />)
    const b = screen.getByRole('button', { name: 'Close' })
    expect(b).toHaveAttribute('type', 'button')
    expect(b).toHaveClass('close-button')
    const svg = b.querySelector('svg')!
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('CloseButton.css (R-B)', () => {
  const css = readUiCss('CloseButton.css')

  it('is a 40 px circle that never shrinks, with a transparent fill and a 1 px outline', () => {
    const d = declarations(css, '.close-button')
    expect(d['inline-size']).toBe('40px')
    expect(d['block-size']).toBe('40px')
    expect(d['flex']).toBe('none')
    expect(d['border-radius']).toMatch(/50%|999|pill|full/)
    expect(d['background']).toMatch(/^(transparent|none)$/)
    expect(d['box-shadow']).toBe('inset 0 0 0 1px var(--color-outline)')
  })

  it('has a 52 px target (12 px more than the circle) and is top-aligned with the title', () => {
    expect(css).toMatch(/inset:\s*-6px/)
    expect(declarations(css, '.close-button')['align-self']).toBe('flex-start')
  })
})
