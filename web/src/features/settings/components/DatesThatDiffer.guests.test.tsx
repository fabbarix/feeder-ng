// B5-F1: a row for a date with Guests.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DatesThatDiffer } from './DatesThatDiffer'
import { twoMembers } from './mealSlotCardFixtures'

describe('DatesThatDiffer: Guests', () => {
  it('says how many Guests a date has', () => {
    render(
      <DatesThatDiffer
        members={twoMembers}
        rows={[{ key: 'k', date: '2026-11-12', dateLabel: 'Thu 12 Nov', slotName: 'Dinner', parts: [{ kind: 'time', time: '20:15', usualTime: '19:30' }, { kind: 'guests', guests: 2 }] }]}
      />,
    )
    expect(screen.getByText('20:15 · usually 19:30')).toBeInTheDocument()
    expect(screen.getByText('2 Guests')).toBeInTheDocument()
  })
})
