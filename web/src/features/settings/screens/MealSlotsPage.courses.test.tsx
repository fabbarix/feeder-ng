// CRS D2 on the Meal Slots page: the Courses field with its removal preview, a server refusal, and the Date Attendance Courses.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { activeCourses, dateWithCourses, thursdayDinnerCourses, tuesdayDinnerCourses } from '../components/courseFixtures'
import { anna, householdSettings, marco, sam } from '../components/fixtures'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import { MealSlotsPage } from './MealSlotsPage'

const slots = [tuesdayDinnerCourses, thursdayDinnerCourses]

function routes(me: typeof ADMIN_ME, extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/me': me,
    'GET /api/household/settings': householdSettings,
    'GET /api/members': [anna, marco, sam],
    'GET /api/meal-slots': slots,
    'GET /api/courses': { courses: activeCourses },
    ...extra,
  })
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12, 0) })
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  window.location.hash = ''
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
/** An Admin taps the Tuesday day of the Dinner card; a plain User taps "Change a date" (the next Dinner is Tuesday 10 Nov). */
const openTuesday = async () => {
  await userEvent.click(within(await screen.findByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Dinner on Tuesday' }))
}
const openNextDinnerDate = async () => {
  await userEvent.click(within(await screen.findByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Change a date for Dinner' }))
}
const rowNames = () => within(screen.getByRole('list', { name: 'Courses in order' })).getAllByTestId('course-name').map((n) => n.textContent)

describe('MealSlotsPage: Courses', () => {
  it('shows the usual Courses on the Dinner card, and who eats the optional Dessert', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    const card = await screen.findByRole('region', { name: 'Dinner' })
    const list = within(card).getByRole('list', { name: 'Courses' })
    expect(within(list).getAllByRole('listitem').map((i) => i.textContent)).toEqual(['Main', 'Side', 'Dessert (optional)'])
    expect(within(card).getByText('Dessert: Anna, Marco only')).toBeInTheDocument()
  })

  it('lists Thursday (no Dessert) under "Differs on"', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    const card = await screen.findByRole('region', { name: 'Dinner' })
    const row = within(within(card).getByRole('list', { name: 'Differs on' })).getByRole('listitem')
    expect(row).toHaveTextContent('Thu')
    expect(row).toHaveTextContent('19:00')
    expect(row).toHaveTextContent('Main · Side')
  })

  it('the editor shows the slot\'s Courses once the household Courses are loaded', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await openTuesday()
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    await within(dialog).findByRole('group', { name: 'Courses' })
    expect(rowNames()).toEqual(['Main', 'Side', 'Dessert'])
  })

  it('previews with a dry run, then saves ONE real batch with the new Courses', async () => {
    const removes = {
      plannedMeals: [{ date: '2026-11-12', mealSlotId: 11, mealSlotName: 'Dinner', courseId: 2, courseName: 'Side', recipeId: 7, recipeName: 'Roast potatoes', pinned: true }],
      slotRules: [],
    }
    const api = routes(ADMIN_ME, {
      'PATCH /api/meal-slots/batch': (c: { body: { dryRun?: boolean; weekdays: number[] } }) => ({
        match: 'Dinner',
        updated: c.body.dryRun ? [] : [tuesdayDinnerCourses, thursdayDinnerCourses],
        skipped: [],
        removes,
      }),
    })
    renderWithProviders(<MealSlotsPage />)
    await openTuesday()
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    await within(dialog).findByRole('group', { name: 'Courses' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Thursday' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove Side' }))
    expect(await within(dialog).findByText('Removes Side from Tue and Thu: 1 Planned Meal goes')).toBeInTheDocument()
    expect(within(dialog).getByText('Roast potatoes · Dinner · Thu 12 Nov')).toBeInTheDocument()
    const dry = api.callsTo('PATCH', '/api/meal-slots/batch').filter((c) => (c.body as { dryRun?: boolean }).dryRun)
    expect(dry.length).toBeGreaterThanOrEqual(1)
    expect(api.callsTo('PATCH', '/api/meal-slots/batch').filter((c) => !(c.body as { dryRun?: boolean }).dryRun)).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/meal-slots/batch').filter((c) => !(c.body as { dryRun?: boolean }).dryRun)).toHaveLength(1))
    const real = api.callsTo('PATCH', '/api/meal-slots/batch').find((c) => !(c.body as { dryRun?: boolean }).dryRun)!
    expect(real.body).toEqual({
      match: 'Dinner',
      weekdays: [2, 4],
      set: { courses: [{ id: 1, optional: false, optOutMemberIds: [] }, { id: 4, optional: true, optOutMemberIds: [3] }] },
    })
    expect(await screen.findByText('Updated Dinner on Tue, Thu.')).toBeInTheDocument()
  })

  it('shows courses_all_optional from the server as its own sentence', async () => {
    routes(ADMIN_ME, {
      'PATCH /api/meal-slots/batch': { status: 422, json: { error: { code: 'validation_failed', message: 'courses: every Course is optional', field: 'courses', reason: 'courses_all_optional' } } },
    })
    renderWithProviders(<MealSlotsPage />)
    await openTuesday()
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    await within(dialog).findByRole('group', { name: 'Courses' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Move Dessert up' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Keep at least one Course that is not optional')
  })
})

describe('MealSlotsPage: Date Attendance Courses', () => {
  it('a plain User records "no Side for Marco" on one date: only the Courses are sent, not the Attendance', async () => {
    const api = routes(USER_ME, {
      'GET /api/meal-slots/10/attendance?date=2026-11-10': { ...dateWithCourses, slotId: 10, date: '2026-11-10' },
      'PUT /api/meal-slots/10/attendance?date=2026-11-10': { ...dateWithCourses, slotId: 10, date: '2026-11-10' },
    })
    renderWithProviders(<MealSlotsPage />)
    await openNextDinnerDate()
    const dialog = await screen.findByRole('dialog', { name: 'Dinner on 2026-11-10' })
    const side = await within(dialog).findByRole('group', { name: 'Side' })
    await userEvent.click(within(side).getByRole('button', { name: 'Marco' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save for this date' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/meal-slots/10/attendance?date=2026-11-10')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/meal-slots/10/attendance?date=2026-11-10')[0]!.body).toEqual({ courses: [{ courseId: 2, optOutMemberIds: [2] }] })
  })
})
