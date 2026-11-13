// B5-F1 (reconcile 1.3, 12): Who's eating from Plan and Today: the Date Attendance sheet with a read-only date and Guests, through Settings' public export.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WhosEatingSheet } from '../index'
import { mockApi, renderWithProviders } from '../test-utils'
import type { DateAttendance } from '../types'
import { members, thursdayDinner } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

const target = { mealSlotId: 11, date: '2026-11-12' }
const PATH = '/api/meal-slots/11/attendance?date=2026-11-12'
const att: DateAttendance = { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5, guests: 0, courses: [] }
const routes = (extra: Record<string, unknown> = {}) => mockApi({ 'GET /api/members': members, 'GET /api/meal-slots': [thursdayDinner], [`GET ${PATH}`]: att, ...extra })
const NAME = "Who's eating Dinner on 2026-11-12"

describe('WhosEatingSheet', () => {
  it('renders nothing and asks for nothing while closed', () => {
    const api = routes()
    renderWithProviders(<WhosEatingSheet target={null} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.calls).toHaveLength(0)
  })

  it('opens the sheet for the slot and date, the date read-only, with Members, Guests and the portions preview', async () => {
    routes()
    renderWithProviders(<WhosEatingSheet target={target} onClose={vi.fn()} />)
    const sheet = await screen.findByRole('dialog', { name: NAME })
    expect(await within(sheet).findByRole('checkbox', { name: 'Anna' })).toBeChecked()
    expect(within(sheet).getByRole('spinbutton', { name: 'Guests' })).toHaveAttribute('aria-valuenow', '0')
    expect(within(sheet).getByText('2.5 portions of each Course')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /Date/ })).not.toBeInTheDocument()
  })

  it('saves the Guests and closes', async () => {
    const api = routes({ [`PUT ${PATH}`]: { ...att, guests: 1 } })
    const onClose = vi.fn()
    renderWithProviders(<WhosEatingSheet target={target} onClose={onClose} />)
    const sheet = await screen.findByRole('dialog', { name: NAME })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Increase Guests' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save for this date' }))
    await waitFor(() => expect(api.callsTo('PUT', PATH)).toHaveLength(1))
    expect(api.callsTo('PUT', PATH)[0]?.body).toMatchObject({ guests: 1 })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('asks beforeEmptying when the save empties the date', async () => {
    const api = routes({ [`PUT ${PATH}`]: { ...att, attendance: [] } })
    const beforeEmptying = vi.fn(async () => false)
    renderWithProviders(<WhosEatingSheet target={target} onClose={vi.fn()} beforeEmptying={beforeEmptying} />)
    const sheet = await screen.findByRole('dialog', { name: NAME })
    for (const name of ['Anna', 'Marco', 'Sam']) await userEvent.click(await within(sheet).findByRole('checkbox', { name }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save for this date' }))
    await waitFor(() => expect(beforeEmptying).toHaveBeenCalledWith(target))
    expect(api.callsTo('PUT', PATH)).toHaveLength(0)
  })

  it('the close button asks onClose', async () => {
    routes()
    const onClose = vi.fn()
    renderWithProviders(<WhosEatingSheet target={target} onClose={onClose} />)
    const sheet = await screen.findByRole('dialog', { name: NAME })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
