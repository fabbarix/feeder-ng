// MS redesign: one Bento card per Meal Slot name: anatomy, roles and labels, what a plain User can and cannot tap.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MealSlotCard } from './MealSlotCard'
import { dinnerCard, fabioOnlyCard, lunchCard, nobodyCard, sixMembers, twoMembers } from './mealSlotCardFixtures'

function setup(card = dinnerCard, over: Partial<React.ComponentProps<typeof MealSlotCard>> = {}) {
  const props = { card, members: twoMembers, canEdit: true, locale: 'en', onEdit: vi.fn(), onFix: vi.fn(), onChangeDate: vi.fn(), onAddOn: vi.fn(), ...over }
  render(<MealSlotCard {...props} />)
  return { props, region: screen.getByRole('region', { name: card.name }) }
}

describe('MealSlotCard: anatomy', () => {
  it('is a region named by the Meal Slot, with the name as a heading, the days and the usual time (data-testid="usual-time")', () => {
    const { region } = setup()
    expect(within(region).getByRole('heading', { name: 'Dinner' })).toBeInTheDocument()
    expect(within(region).getByText('Every day')).toBeInTheDocument()
    expect(within(region).getByTestId('usual-time')).toHaveTextContent('19:30')
    expect(within(region).queryByText(/AM|PM/)).toBeNull()
  })
  it('says the days of a one-day name in full', () => {
    const { region } = setup(lunchCard)
    expect(within(region).getByText('Sunday')).toBeInTheDocument()
  })
  it('lists the usual Courses as a list, optional ones marked', () => {
    const { region } = setup(lunchCard)
    const list = within(region).getByRole('list', { name: 'Courses' })
    expect(within(list).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Starter', 'Main', 'Dessert (optional)'])
  })
  it('says who eats an optional Course when only some do', () => {
    const { region } = setup(lunchCard)
    expect(within(region).getByText('Dessert: Mia only')).toBeInTheDocument()
  })
  it('shows no Attendance when everyone eats (the page says it once for the Household)', () => {
    const { region } = setup()
    expect(within(region).queryByRole('list', { name: 'Attending Dinner' })).toBeNull()
    expect(within(region).queryByText('Everyone')).toBeNull()
  })
  it('shows an Avatar stack and "Fabio only" when the usual Attendance differs', () => {
    const { region } = setup(fabioOnlyCard)
    const list = within(region).getByRole('list', { name: 'Attending Brunch' })
    expect(within(list).getAllByRole('img').map((i) => i.getAttribute('aria-label'))).toEqual(['Fabio'])
    expect(within(region).getByText('Fabio only')).toBeInTheDocument()
  })
  it('has the anchor ids of its slots for deep links, on the strip days', () => {
    const { region } = setup()
    expect(region.querySelector('#meal-slot-201')).not.toBeNull()
    expect(region.querySelector('#meal-slot-207')).not.toBeNull()
  })
})

describe('MealSlotCard: the 7-day strip', () => {
  it('is a group of seven days with the time on the days it runs', () => {
    const { region } = setup()
    const strip = within(region).getByRole('group', { name: 'Dinner by weekday' })
    expect(within(strip).getByText('20:00')).toBeInTheDocument()
    expect(within(strip).getAllByText('19:30')).toHaveLength(6)
  })
  it('an Admin taps a day to edit that Meal Slot', async () => {
    const { props, region } = setup()
    await userEvent.click(within(region).getByRole('button', { name: 'Dinner on Friday, 20:00' }))
    expect(props.onEdit).toHaveBeenCalledWith(dinnerCard.differences[1]!.slot)
  })
  it('an Admin gets a dashed "+" on a free day that adds that name on that weekday', async () => {
    const { props, region } = setup(lunchCard)
    await userEvent.click(within(region).getByRole('button', { name: 'Add Lunch on Tuesday' }))
    expect(props.onAddOn).toHaveBeenCalledWith(2, 'Lunch')
  })
  it('the "+" is disabled while the Members have not loaded', () => {
    const { region } = setup(lunchCard, { addDisabled: true })
    expect(within(region).getByRole('button', { name: 'Add Lunch on Tuesday' })).toBeDisabled()
  })
})

describe('MealSlotCard: "Differs on"', () => {
  it('lists Wednesday and Friday with only what differs', () => {
    const { region } = setup()
    const list = within(region).getByRole('list', { name: 'Differs on' })
    const rows = within(list).getAllByRole('listitem').map((i) => i.textContent)
    expect(rows[0]).toContain('Wed')
    expect(rows[0]).toContain('Fabio only')
    expect(rows[1]).toContain('Fri')
    expect(rows[1]).toContain('20:00')
    expect(rows[1]).toContain('Main only')
  })
  it('has no list when nothing differs', () => {
    const { region } = setup(lunchCard)
    expect(within(region).queryByRole('list', { name: 'Differs on' })).toBeNull()
  })
  it('an Admin opens that weekday\'s Meal Slot from its row', async () => {
    const { props, region } = setup()
    await userEvent.click(within(region).getByRole('button', { name: 'Edit Dinner on Wednesday: Fabio only' }))
    expect(props.onEdit).toHaveBeenCalledWith(dinnerCard.differences[0]!.slot)
  })
})

describe('MealSlotCard: footer buttons and "Nobody attending"', () => {
  it('"Edit Dinner" (Admin) edits the card\'s usual slot', async () => {
    const { props, region } = setup()
    await userEvent.click(within(region).getByRole('button', { name: 'Edit Dinner' }))
    expect(props.onEdit).toHaveBeenCalledWith(dinnerCard.editSlot)
  })
  it('"Change a date" hands over the whole card', async () => {
    const { props, region } = setup()
    await userEvent.click(within(region).getByRole('button', { name: 'Change a date for Dinner' }))
    expect(props.onChangeDate).toHaveBeenCalledWith(dinnerCard)
  })
  it('the visible label of the date button is "Change a date"', () => {
    const { region } = setup()
    expect(within(region).getByRole('button', { name: 'Change a date for Dinner' })).toHaveTextContent('Change a date')
  })
  it('a card nobody attends has a warning button that asks to choose who attends', async () => {
    const { props, region } = setup(nobodyCard)
    await userEvent.click(within(region).getByRole('button', { name: /^Nobody attending/ }))
    expect(props.onFix).toHaveBeenCalledWith(nobodyCard.editSlot)
  })
})

describe('MealSlotCard: a plain User (read-only except "Change a date")', () => {
  it('has no Edit, no day buttons, no "+" and no row buttons', () => {
    const { region } = setup(dinnerCard, { canEdit: false })
    expect(within(region).queryByRole('button', { name: 'Edit Dinner' })).toBeNull()
    expect(within(region).queryByRole('button', { name: /^Dinner on / })).toBeNull()
    expect(within(region).queryByRole('button', { name: /^Edit Dinner on / })).toBeNull()
    expect(within(setup(lunchCard, { canEdit: false }).region).queryByRole('button', { name: /^Add / })).toBeNull()
  })
  it('still shows the days, times and the differences', () => {
    const { region } = setup(dinnerCard, { canEdit: false })
    expect(within(region).getByText('20:00')).toBeInTheDocument()
    expect(within(region).getByRole('list', { name: 'Differs on' })).toBeInTheDocument()
  })
  it('can use "Change a date"', async () => {
    const { props, region } = setup(dinnerCard, { canEdit: false })
    await userEvent.click(within(region).getByRole('button', { name: 'Change a date for Dinner' }))
    expect(props.onChangeDate).toHaveBeenCalledWith(dinnerCard)
  })
  it('"Nobody attending" is still a button (it leads to the one-date Attendance)', async () => {
    const { props, region } = setup(nobodyCard, { canEdit: false })
    await userEvent.click(within(region).getByRole('button', { name: /^Nobody attending/ }))
    expect(props.onFix).toHaveBeenCalled()
  })
})

describe('MealSlotCard: six Members', () => {
  it('shows four Avatars then "+1" for five attending, and names the rest through the text', () => {
    const card = { ...fabioOnlyCard, usualAttendance: { state: 'some' as const, memberIds: [1, 2, 3, 4, 5] } }
    const { region } = setup(card, { members: sixMembers })
    const list = within(region).getByRole('list', { name: 'Attending Brunch' })
    expect(within(list).getAllByRole('img')).toHaveLength(4)
    expect(within(list).getByText('+1')).toBeInTheDocument()
    expect(within(region).getByText('Mia, Fabio, Sam, Pia, Nonna only')).toBeInTheDocument()
  })
})
