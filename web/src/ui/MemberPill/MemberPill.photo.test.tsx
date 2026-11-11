// PE: a Member's pill shows the Photo, else the emoji, else the initials (the Avatar's fallback order), with the colour ring.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemberPill } from './MemberPill'

const photo = `/api/images/${'a'.repeat(32)}`

describe('MemberPill: Photo', () => {
  it('draws the Photo when there is one, named for the Member, keeping the first name and the colour', () => {
    const { container } = render(<MemberPill name="Anna Rossi" colour="#3366cc" glyph="🦊" photoUrl={photo} />)
    const img = screen.getByRole('img', { name: 'Anna Rossi' })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', photo)
    expect(img).toHaveAttribute('data-coloured', 'true')
    expect(container.querySelector('[data-member-colour="#3366cc"]')).not.toBeNull()
    expect(screen.getByText('Anna')).toBeInTheDocument()
  })

  it('a Photo that fails to load falls back to the emoji', () => {
    render(<MemberPill name="Sam" colour="#81b29a" glyph="🦊" photoUrl={photo} />)
    fireEvent.error(screen.getByRole('img', { name: 'Sam' }))
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
  })

  it('then to the initials when there is no emoji', () => {
    render(<MemberPill name="Zia Rosa" colour="#81b29a" photoUrl={photo} />)
    fireEvent.error(screen.getByRole('img', { name: 'Zia Rosa' }))
    expect(screen.getByRole('img', { name: 'Zia Rosa' })).toHaveTextContent('ZR')
  })

  it('without a Photo it is the emoji, as before', () => {
    render(<MemberPill name="Sam" colour="#81b29a" glyph="🦊" />)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
  })
})
