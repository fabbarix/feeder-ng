// IM2: the Members list draws each Member's photo (photo > emoji > initials).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { anna, sam } from './fixtures'
import { MemberList } from './MemberList'

const withPhoto = { ...anna, photo: 'a'.repeat(32), photoUrl: `/api/images/${'a'.repeat(32)}` }

describe('MemberList: photos', () => {
  it('shows the photo of a Member that has one, and the emoji or initials for the others', () => {
    render(<MemberList members={[withPhoto, sam, { ...anna, id: 9, name: 'Marco' }]} canEdit onAdd={() => {}} onEdit={() => {}} />)
    const photo = screen.getByRole('img', { name: 'Anna' })
    expect(photo.tagName).toBe('IMG')
    expect(photo).toHaveAttribute('src', withPhoto.photoUrl)
    expect(screen.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
    expect(screen.getByRole('img', { name: 'Marco' })).toHaveTextContent('M')
  })
})
