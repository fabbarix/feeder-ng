// PE: the Meal Slot attendee pills show each Member's Photo, else the emoji, else the initials (through MemberPill / Avatar).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttendeePills } from './AttendeePills'
import { members, tuesdayDinner } from './fixtures'

const photo = `/api/images/${'a'.repeat(32)}`
const withPhotos = members.map((m, i) => (i === 0 ? { ...m, photo: 'a'.repeat(32), photoUrl: photo } : m))
const list = () => screen.getByRole('list', { name: 'Attending Dinner on Tuesday' })

describe('AttendeePills: Photos', () => {
  it('a Member with a Photo shows it in their pill, the others keep emoji or initials', () => {
    render(<AttendeePills slot={tuesdayDinner} members={withPhotos} />)
    const first = withPhotos[0]!
    expect(within(list()).getByRole('img', { name: first.name })).toHaveAttribute('src', photo)
    expect(list().querySelectorAll('img')).toHaveLength(1)
    expect(within(list()).getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
  })

  it('a Photo that fails to load falls back to that Member\'s emoji or initials', () => {
    render(<AttendeePills slot={tuesdayDinner} members={withPhotos} />)
    fireEvent.error(list().querySelector('img')!)
    expect(list().querySelector('img')).toBeNull()
  })
})
