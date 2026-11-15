// B9-46 (PC-08): Who's eating knows who is away. An away row says "Away Thu 12 – Sat 14", its attendance control is off and disabled, and
// "<Name> eats here anyway" (a switch) brings the Member to this one Meal Slot (`despiteAway`). "Someone away for more days? Add an Away".
// The Meal Slot is Thu 12 Nov Dinner (Anna 1, Marco 1 and Sam 0.5 usually eat); Marco is away Thu 12 – Sat 14.
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DateAttendance } from '../types'
import { DateAttendancePanel } from './DateAttendancePanel'
import { members, thursdayDinner } from './fixtures'

afterEach(cleanup)

const away = { memberId: 2, memberName: 'Marco', awayId: 9, from: '2026-11-12', fromMealSlotId: null, through: '2026-11-14', throughMealSlotId: null }
const answer = (over: Partial<DateAttendance> = {}): DateAttendance => ({
  slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 1.5, guests: 0, away: [away], ...over,
})

function setup(attendance: DateAttendance = answer(), over: Partial<React.ComponentProps<typeof DateAttendancePanel>> = {}) {
  const props = { open: true, slot: thursdayDinner, date: '2026-11-12', attendance, members, dateReadOnly: true, onChangeDate: vi.fn(), onSave: vi.fn(), onReset: vi.fn(), onClose: vi.fn(), ...over }
  render(<DateAttendancePanel {...props} />)
  return props
}
const row = (name: string) => screen.getByText(name, { selector: '.attendance__name' }).closest('li') as HTMLElement
const status = () => document.querySelector('.attendance-editor [role="status"]') as HTMLElement

describe("Who's eating: a Member who is away", () => {
  it('their row says "Away Thu 12 – Sat 14"; the others say nothing', () => {
    setup()
    expect(row('Marco')).toHaveTextContent('Away Thu 12 – Sat 14')
    expect(row('Anna')).not.toHaveTextContent(/Away/)
    expect(row('Sam')).not.toHaveTextContent(/Away/)
  })

  it('their attendance control is off and disabled, and "Marco eats here anyway" is an off switch', () => {
    setup()
    const check = within(row('Marco')).getByRole('checkbox')
    expect(check).toBeDisabled()
    expect(check).not.toBeChecked()
    expect(within(row('Marco')).getByRole('switch', { name: 'Marco eats here anyway' })).not.toBeChecked()
    expect(screen.queryByRole('switch', { name: /Anna eats here anyway/ })).toBeNull()
  })

  it('the portions leave them out: 1.5 with Anna and Sam, then 2.5 once Marco eats here anyway', async () => {
    setup()
    expect(status()).toHaveTextContent('Portions needed: 1.5')
    expect(screen.getByText('1.5 portions of each Course')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('switch', { name: 'Marco eats here anyway' }))
    expect(status()).toHaveTextContent('Portions needed: 2.5')
    expect(screen.getByText('2.5 portions of each Course')).toBeInTheDocument()
  })

  it('Save for this date carries despiteAway for Marco only', async () => {
    const props = setup()
    await userEvent.click(screen.getByRole('switch', { name: 'Marco eats here anyway' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save for this date' }))
    const sent = props.onSave.mock.calls[0]![0] as { memberId: number; despiteAway?: boolean }[]
    expect(sent.find((e) => e.memberId === 2)).toEqual({ memberId: 2, portionFactorOverride: null, despiteAway: true })
    expect(sent.filter((e) => e.despiteAway)).toHaveLength(1)
  })

  it('a date that already has them eating here anyway shows the switch on, the control checked, and their Portion Factor stepper', () => {
    const eats = thursdayDinner.attendance.map((e) => (e.memberId === 2 ? { ...e, despiteAway: true } : e))
    setup(answer({ isOverride: true, attendance: eats, portionsNeeded: 2.5 }))
    expect(within(row('Marco')).getByRole('switch', { name: 'Marco eats here anyway' })).toBeChecked()
    expect(within(row('Marco')).getByRole('checkbox')).toBeChecked()
    expect(within(row('Marco')).getByRole('spinbutton', { name: /Marco/ })).toBeInTheDocument()
    expect(status()).toHaveTextContent('Portions needed: 2.5')
  })

  it('without an Away on the date there is no away row and no switch', () => {
    setup(answer({ away: [], portionsNeeded: 2.5 }))
    expect(screen.queryByRole('switch')).toBeNull()
    expect(status()).toHaveTextContent('Portions needed: 2.5')
  })
})

describe("Who's eating: Add an Away", () => {
  it('"Someone away for more days?" with an outlined "Add an Away", when the screen can open it', async () => {
    const onAddAway = vi.fn()
    setup(answer(), { onAddAway })
    expect(screen.getByText(/Someone away for more days\?/)).toBeInTheDocument()
    const add = screen.getByRole('button', { name: 'Add an Away' })
    expect(add).toHaveAttribute('data-variant', 'secondary')
    expect(add.closest('.sheet__footer')).toBeNull() // it is in the body, not the footer
    await userEvent.click(add)
    expect(onAddAway).toHaveBeenCalledTimes(1)
  })

  it('without the handler the line is not there', () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Add an Away' })).toBeNull()
  })
})
