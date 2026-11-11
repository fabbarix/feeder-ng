// IM2: the Avatar primitive owns the "picture failed to load" fallback (it lived in access/RequestAvatar, decision A8):
// photo -> emoji (glyph) -> initials. A new picture address gets a new try.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar: a picture that fails to load', () => {
  it('falls back to the initials, keeping the name, size and ring', () => {
    render(<Avatar name="Zia Rosa" imageUrl="/api/images/gone" size="lg" colour="#3366cc" />)
    fireEvent.error(screen.getByRole('img', { name: 'Zia Rosa' }))
    const fallback = screen.getByRole('img', { name: 'Zia Rosa' })
    expect(fallback.tagName).not.toBe('IMG')
    expect(fallback).toHaveTextContent('ZR')
    expect(fallback).toHaveAttribute('data-size', 'lg')
    expect(fallback).toHaveAttribute('data-coloured', 'true')
    expect(document.querySelector('img')).toBeNull()
  })

  it('falls back to the emoji first when there is one', () => {
    render(<Avatar name="Sam" imageUrl="/api/images/gone" glyph="🦊" />)
    fireEvent.error(screen.getByRole('img', { name: 'Sam' }))
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the picture again when its address changes after a failure', () => {
    const { rerender } = render(<Avatar name="Sam" imageUrl="/api/images/one" />)
    fireEvent.error(screen.getByRole('img', { name: 'Sam' }))
    expect(document.querySelector('img')).toBeNull()
    rerender(<Avatar name="Sam" imageUrl="/api/images/two" />)
    expect(document.querySelector('img')).toHaveAttribute('src', '/api/images/two')
  })

  it('keeps showing the initials for the same address (no retry loop)', () => {
    const { rerender } = render(<Avatar name="Sam" imageUrl="/api/images/one" />)
    fireEvent.error(screen.getByRole('img', { name: 'Sam' }))
    rerender(<Avatar name="Sam" imageUrl="/api/images/one" size="sm" />)
    expect(document.querySelector('img')).toBeNull()
  })

  it('adds no wrapper element around the picture (the Avatar is one element)', () => {
    const { container } = render(<Avatar name="Sam" imageUrl="/p.png" />)
    expect(container.children).toHaveLength(1)
    expect(container.firstElementChild?.tagName).toBe('IMG')
  })
})
