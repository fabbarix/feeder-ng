import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BrandMark } from './BrandMark'

// b8-shop: the symbol of docs/brand/master/mark-small.svg, inline, decorative (the word beside it names the app).
describe('BrandMark', () => {
  it('is a decorative inline SVG with the brand viewBox', () => {
    const { container } = render(<BrandMark />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg).toHaveAttribute('viewBox', '0 0 512 512')
    expect(svg).not.toHaveAttribute('role')
    expect(container.textContent).toBe('')
  })
  it('has a basil body and a heart, coloured by classes (no colour literal in the markup)', () => {
    const { container } = render(<BrandMark />)
    expect(container.querySelector('path.brand-mark__body')).toBeInTheDocument()
    expect(container.querySelector('path.brand-mark__heart')).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb|hsl|fill="/)
  })
})
