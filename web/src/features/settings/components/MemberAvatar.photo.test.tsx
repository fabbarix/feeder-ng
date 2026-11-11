// IM2: a Member's avatar renders photo > emoji > initials; a photo that cannot load falls back through the same chain.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemberAvatar } from './MemberAvatar'

const ID = 'a'.repeat(32)

describe('MemberAvatar: photo', () => {
  it('shows the photo from the image store, named for assistive technology, with the Member colour ring', () => {
    render(<MemberAvatar name="Sam" colour="#81b29a" photo={ID} />)
    const img = screen.getByRole('img', { name: 'Sam' })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', `/api/images/${ID}`)
    expect(img).toHaveAttribute('data-coloured', 'true')
  })

  it('the photo wins over the emoji', () => {
    render(<MemberAvatar name="Sam" colour="#81b29a" avatar="🦊" photo={ID} />)
    expect(screen.getByRole('img', { name: 'Sam' }).tagName).toBe('IMG')
  })

  it('a photo that fails to load falls back to the emoji, then to the initials when there is no emoji', () => {
    const { rerender } = render(<MemberAvatar name="Sam" colour="#81b29a" avatar="🦊" photo={ID} />)
    fireEvent.error(screen.getByRole('img', { name: 'Sam' }))
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
    rerender(<MemberAvatar name="Sam" colour="#81b29a" avatar="" photo={'b'.repeat(32)} />)
    fireEvent.error(screen.getByRole('img', { name: 'Sam' }))
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('S')
  })

  it('an empty or missing photo shows the emoji or the initials, never a broken image', () => {
    const { rerender } = render(<MemberAvatar name="Sam" colour="#81b29a" avatar="🦊" photo="" />)
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
    rerender(<MemberAvatar name="Sam" colour="#81b29a" />)
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('S')
    expect(document.querySelector('img')).toBeNull()
  })
})
