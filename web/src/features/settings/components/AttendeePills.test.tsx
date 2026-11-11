import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Icon } from '../../../ui'
import { AttendeePills } from './AttendeePills'
import { bigFamily, mondayLunch, members, tuesdayDinner } from './fixtures'

const everyone = { ...tuesdayDinner, attendance: bigFamily.map((m) => ({ memberId: m.id, portionFactorOverride: null })) }

describe('AttendeePills (R15: who eats at this Meal Slot)', () => {
  it('is a list named for the slot, one pill per Member with colour, avatar and first name', () => {
    const { container } = render(<AttendeePills slot={tuesdayDinner} members={members} />)
    const list = screen.getByRole('list', { name: 'Attending Dinner on Tuesday' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(within(list).getByText('Anna')).toBeInTheDocument()
    expect(container.querySelector('[data-member-colour="#e07a5f"]')).not.toBeNull()
    expect(within(list).getByRole('img', { name: 'Sam' })).toHaveTextContent('🦊')
  })

  it('shows four pills and "+2" for six attendees, with the hidden names available', () => {
    render(<AttendeePills slot={everyone} members={bigFamily} />)
    const list = screen.getByRole('list', { name: 'Attending Dinner on Tuesday' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(5)
    expect(within(list).getByText('Pia')).toBeInTheDocument()
    expect(within(list).queryByText('Nonna')).toBeNull()
    const more = within(list).getByText('+2')
    expect(more.closest('[aria-label]')?.getAttribute('aria-label')).toBe('and 2 more: Nonna, Zio Carlo')
  })

  it('no "+N" when four or fewer attend', () => {
    render(<AttendeePills slot={{ ...everyone, attendance: everyone.attendance.slice(0, 4) }} members={bigFamily} />)
    expect(screen.queryByText(/^\+\d/)).toBeNull()
  })

  it('"Nobody attending" is a warning button that offers the fix, and no list', async () => {
    const onFix = vi.fn()
    render(<AttendeePills slot={mondayLunch} members={members} onFix={onFix} />)
    expect(screen.queryByRole('list')).toBeNull()
    const pill = screen.getByRole('button', { name: /^Nobody attending/ })
    expect(pill).toHaveAccessibleName(/choose who attends Lunch on Monday/i)
    expect(pill.closest('[data-tone]')?.getAttribute('data-tone') ?? pill.getAttribute('data-tone')).toBe('warn')
    await userEvent.click(pill)
    expect(onFix).toHaveBeenCalledWith(mondayLunch)
  })

  it('without a fix handler, "Nobody attending" is plain text, not a dead button', () => {
    render(<AttendeePills slot={mondayLunch} members={members} />)
    expect(screen.getByText('Nobody attending')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('the "Nobody attending" pill carries a warning-circle glyph, not the hourglass that "warning" maps to', () => {
    const { container } = render(<AttendeePills slot={mondayLunch} members={members} onFix={() => {}} />)
    const expected = render(<Icon name="error" size={14} />).container.querySelector('svg')!.innerHTML
    expect(container.querySelector('.nobody-pill svg')!.innerHTML).toBe(expected)
  })
})
