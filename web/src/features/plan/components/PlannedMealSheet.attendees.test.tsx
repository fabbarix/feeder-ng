// PE (plan/today: NEW file only, the production edit waits for R2-2's merge): the Planned Meal sheet's attendees are Avatars with the
// Member's Photo, else emoji, else initials, in the Member colour. Wire keys of an attendee: `photoUrl` and `avatar` (see the design note).
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { slot } from '../test-utils'
import type { PlanSlot } from '../types'
import { PlannedMealSheet } from './PlannedMealSheet'

const photo = `/api/images/${'a'.repeat(32)}`
const attendance = [
  { id: 1, name: 'Anna', colour: '#3366cc', photoUrl: photo, avatar: '🙂' },
  { id: 2, name: 'Sam', colour: '#81b29a', avatar: '🦊' },
  { id: 3, name: 'Zia Rosa', colour: '#e07a5f' },
]
const open = () => {
  const s = slot({ attendance } as unknown as Partial<PlanSlot>)
  render(<PlannedMealSheet open slot={s} courseId={1} today="2026-11-10" onClose={vi.fn()} onCook={vi.fn()} onMarkCooked={vi.fn()} onSwap={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()} onChoose={vi.fn()} />)
  return within(screen.getByRole('dialog'))
}

describe('PlannedMealSheet: attendee avatars', () => {
  it('draws the Photo of a Member who has one', () => {
    const d = open()
    expect(d.getByRole('img', { name: 'Anna' })).toHaveAttribute('src', photo)
  })

  it('then the emoji, then the initials', () => {
    const d = open()
    expect(d.getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
    expect(d.getByRole('img', { name: 'Zia Rosa' })).toHaveTextContent('ZR')
  })

  it('every avatar has the Member colour ring', () => {
    const d = open()
    for (const n of ['Anna', 'Sam', 'Zia Rosa']) expect(d.getByRole('img', { name: n })).toHaveAttribute('data-coloured', 'true')
  })

  it('a Photo that fails to load falls back to the emoji', () => {
    const d = open()
    fireEvent.error(d.getByRole('img', { name: 'Anna' }))
    expect(d.getByRole('img', { name: 'Anna' })).toHaveTextContent('🙂')
  })
})
