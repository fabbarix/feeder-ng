// R11a: Avatar `glyph?: string` (an emoji) is shown instead of the initials; the ring and the name stay.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar glyph', () => {
  it('shows the glyph instead of the initials, still named for assistive technology', () => {
    render(<Avatar name="Sam" glyph="🦊" colour="#81b29a" />)
    const a = screen.getByRole('img', { name: 'Sam' })
    expect(a).toHaveTextContent('🦊')
    expect(a).not.toHaveTextContent('S')
    expect(a).toHaveAttribute('data-coloured', 'true')
  })

  it('an empty glyph falls back to the initials', () => {
    render(<Avatar name="Sam" glyph="" />)
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('S')
  })

  it('a photo wins over the glyph', () => {
    render(<Avatar name="Sam" glyph="🦊" imageUrl="/p.png" />)
    expect(screen.getByRole('img', { name: 'Sam' }).tagName).toBe('IMG')
  })
})
