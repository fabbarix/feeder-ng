// /settings/courses (CRS D2): the Courses list, add, rename, Make main, reorder, Delete / Archive and Unarchive.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Course } from '../../../lib/courses'
import { findNotice, noticeWith } from '../../../test/notices'
import { activeCourses, allCourses, brunchCourse, sideImpact } from '../components/courseFixtures'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import { CoursesPage } from './CoursesPage'

afterEach(() => vi.unstubAllGlobals())

const LIST = 'GET /api/courses?archived=1'

function routes(me = ADMIN_ME, extra: Record<string, unknown> = {}, list: () => Course[] = () => allCourses) {
  return mockApi({ 'GET /api/me': me, [LIST]: () => ({ courses: list() }), ...extra })
}
const show = async () => {
  renderWithProviders(<CoursesPage />, '/settings/courses')
  await screen.findByRole('list', { name: 'Courses' })
}
const rows = () => within(screen.getByRole('list', { name: 'Courses' })).getAllByRole('listitem')
const nameOf = (row: HTMLElement) => within(row).getByTestId('course-name').textContent
const rowOf = (name: string) => rows().find((r) => nameOf(r) === name)!
const menuFor = async (name: string, item: string) => {
  await userEvent.click(within(rowOf(name)).getByRole('button', { name: `Actions for ${name}` }))
  await userEvent.click(screen.getByRole('menuitem', { name: item }))
}

describe('CoursesPage: the list', () => {
  it('has its h1, a Settings breadcrumb and the explanation', async () => {
    routes()
    await show()
    expect(screen.getByRole('heading', { level: 1, name: 'Courses' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByText(/in the order every picker lists them/)).toBeInTheDocument()
  })

  it('shows the active Courses in household order with what uses each, and the main chip on the main Course only', async () => {
    routes()
    await show()
    expect(rows().map(nameOf)).toEqual(['Main', 'Side', 'Starter', 'Dessert'])
    expect(rows().map((r) => within(r).getByText(/^\d+ Recipes? · \d+ Meal Slots?$/).textContent)).toEqual([
      '12 Recipes · 5 Meal Slots', '8 Recipes · 3 Meal Slots', '1 Recipe · 1 Meal Slot', '4 Recipes · 2 Meal Slots',
    ])
    expect(screen.getAllByTestId('course-main-chip')).toHaveLength(1)
    expect(within(rows()[0]!).getByTestId('course-main-chip')).toBeInTheDocument()
  })

  it('keeps archived Courses out of the list, in a collapsed "Archived Courses (1)" section', async () => {
    routes()
    await show()
    expect(screen.queryByText('Brunch')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Archived Courses (1)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Brunch')).toBeInTheDocument()
  })

  it('has no archived section when nothing is archived', async () => {
    routes(ADMIN_ME, {}, () => activeCourses)
    await show()
    expect(screen.queryByRole('button', { name: /^Archived Courses/ })).toBeNull()
  })

  it('says it is loading, and says so when the Courses cannot be loaded', async () => {
    routes(ADMIN_ME, { [LIST]: { status: 500, json: { error: { code: 'internal', message: 'boom' } } } })
    renderWithProviders(<CoursesPage />, '/settings/courses')
    expect(noticeWith('status', 'Loading Courses')).toBeDefined()
    expect(await screen.findByText('Could not load the Courses.')).toBeInTheDocument()
  })

  it('composes the shared ListPage and uses no native dialog', async () => {
    const raw = import.meta.glob('./CoursesPage.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const source = (raw['./CoursesPage.tsx'] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(source).toMatch(/<ListPage\b/)
    expect(source).not.toMatch(/\b(window\.)?(alert|confirm|prompt)\(/)
    expect(source).not.toMatch(/<select\b/)
  })
})

describe('CoursesPage: a plain User', () => {
  it('reads the list and nothing more: no handle, no actions, no Add Course', async () => {
    routes(USER_ME)
    await show()
    expect(await screen.findByText('Only an Admin can change the Courses.')).toBeInTheDocument()
    expect(rows()).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /^Reorder / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Actions for / })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'New Course' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Course' })).toBeNull()
  })

  it('may open the archived section but cannot Unarchive', async () => {
    routes(USER_ME)
    await show()
    await userEvent.click(screen.getByRole('button', { name: 'Archived Courses (1)' }))
    expect(screen.getByText('Brunch')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unarchive Brunch' })).toBeNull()
  })
})

describe('CoursesPage: Add Course', () => {
  it('POSTs the trimmed name, empties the field and says so', async () => {
    let list = allCourses
    const api = routes(ADMIN_ME, {
      'POST /api/courses': (c: { body: { name: string } }) => {
        const created: Course = { id: 9, name: c.body.name, position: 5, main: false, archived: false, recipeCount: 0, mealSlotCount: 0, planned: false }
        list = [...activeCourses, created, brunchCourse]
        return { status: 201, json: created }
      },
    }, () => list)
    await show()
    await userEvent.type(screen.getByRole('textbox', { name: 'New Course' }), '  Cheese ')
    await userEvent.click(screen.getByRole('button', { name: 'Add Course' }))
    expect(api.callsTo('POST', '/api/courses')[0]!.body).toEqual({ name: 'Cheese' })
    expect(await findNotice('status', 'Added Cheese.')).toBeInTheDocument()
    await waitFor(() => expect(rows()).toHaveLength(5))
    expect(screen.getByRole('textbox', { name: 'New Course' })).toHaveValue('')
  })

  it('Enter in the field adds too', async () => {
    const api = routes(ADMIN_ME, { 'POST /api/courses': { status: 201, json: { ...activeCourses[0], id: 9, name: 'Cheese', main: false } } })
    await show()
    await userEvent.type(screen.getByRole('textbox', { name: 'New Course' }), 'Cheese{Enter}')
    await waitFor(() => expect(api.callsTo('POST', '/api/courses')).toHaveLength(1))
  })

  it.each([
    ['', 'Name the Course'],
    ['  side ', 'There is already a Course with that name'],
    ['BRUNCH', 'There is already a Course with that name'],
    ['x'.repeat(41), 'Use 40 characters or fewer'],
  ])('refuses %j before asking the server: %s', async (typed, message) => {
    const api = routes()
    await show()
    if (typed) await userEvent.type(screen.getByRole('textbox', { name: 'New Course' }), typed)
    await userEvent.click(screen.getByRole('button', { name: 'Add Course' }))
    expect(noticeWith('alert', message)).toBeDefined()
    expect(api.callsTo('POST', '/api/courses')).toHaveLength(0)
  })

  it('shows the server\'s sentence when the name is taken after all (an archived Course)', async () => {
    routes(ADMIN_ME, { 'POST /api/courses': { status: 409, json: { error: { code: 'course_name_taken', message: 'Brunch is archived: unarchive it instead.', archivedCourseId: 5 } } } })
    await show()
    await userEvent.type(screen.getByRole('textbox', { name: 'New Course' }), 'Brunchy')
    await userEvent.click(screen.getByRole('button', { name: 'Add Course' }))
    expect(await screen.findByText('Brunch is archived: unarchive it instead.')).toBeInTheDocument()
  })

  it('at 20 Courses the field and the button are off and the limit is explained', async () => {
    const twenty: Course[] = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, name: `Course ${i + 1}`, position: i, main: i === 0, archived: false, recipeCount: 0, mealSlotCount: 0, planned: false }))
    routes(ADMIN_ME, {}, () => [...twenty, brunchCourse])
    await show()
    expect(screen.getByRole('textbox', { name: 'New Course' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Course' })).toBeDisabled()
    expect(screen.getByText('The list holds 20 Courses. Delete or archive one to add another.')).toBeInTheDocument()
  })
})

describe('CoursesPage: Rename and Make main', () => {
  it('Rename edits in place and PATCHes the new name on Enter', async () => {
    // The list is stateful: after the PATCH the server serves the new name, so the page can only show it by refetching.
    const renamed = { value: false }
    const api = routes(
      ADMIN_ME,
      { 'PATCH /api/courses/2': () => { renamed.value = true; return { ...activeCourses[1], name: 'Sides' } } },
      () => allCourses.map((c) => (c.id === 2 && renamed.value ? { ...c, name: 'Sides' } : c)),
    )
    await show()
    await menuFor('Side', 'Rename')
    const field = screen.getByRole('textbox', { name: 'Rename Side' })
    expect(field).toHaveValue('Side')
    await userEvent.clear(field)
    await userEvent.type(field, 'Sides{Enter}')
    expect(api.callsTo('PATCH', '/api/courses/2')[0]!.body).toEqual({ name: 'Sides' })
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Rename Side' })).toBeNull())
    expect(await findNotice('status', 'Renamed to Sides.')).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/courses?archived=1').length).toBeGreaterThan(1)
    await waitFor(() => expect(rows().map(nameOf)).toEqual(['Main', 'Sides', 'Starter', 'Dessert']))
    // Focus returns to the row's actions button (named after the new name), never to <body>.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Sides' })).toHaveFocus())
  })

  it('focus returns to "Actions for <name>" after Escape too', async () => {
    routes()
    await show()
    await menuFor('Side', 'Rename')
    await userEvent.type(screen.getByRole('textbox', { name: 'Rename Side' }), 'x{Escape}')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Side' })).toHaveFocus())
  })

  it('focus returns to "Actions for <name>" after the Cancel button', async () => {
    routes()
    await show()
    await menuFor('Side', 'Rename')
    const row = screen.getByRole('textbox', { name: 'Rename Side' }).closest('li')!
    await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Side' })).toHaveFocus())
  })

  it('Escape cancels the rename without a request', async () => {
    const api = routes()
    await show()
    await menuFor('Side', 'Rename')
    await userEvent.type(screen.getByRole('textbox', { name: 'Rename Side' }), 'x{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Rename Side' })).toBeNull()
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('refuses a name another Course has, with the same validation as adding, and stays open', async () => {
    const api = routes()
    await show()
    await menuFor('Side', 'Rename')
    const field = screen.getByRole('textbox', { name: 'Rename Side' })
    await userEvent.clear(field)
    await userEvent.type(field, 'dessert{Enter}')
    expect(noticeWith('alert', 'There is already a Course with that name')).toBeDefined()
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false)
    expect(field).toBeInTheDocument()
  })

  it('Make main PATCHes main: true and says so', async () => {
    const api = routes(ADMIN_ME, { 'PATCH /api/courses/4': { ...activeCourses[3], main: true } })
    await show()
    await menuFor('Dessert', 'Make main')
    expect(api.callsTo('PATCH', '/api/courses/4')[0]!.body).toEqual({ main: true })
    expect(await findNotice('status', 'Dessert is now the main Course.')).toBeInTheDocument()
  })

  it('the main Course has no Make main and its Delete is disabled', async () => {
    routes()
    await show()
    await userEvent.click(within(rowOf('Main')).getByRole('button', { name: 'Actions for Main' }))
    expect(screen.queryByRole('menuitem', { name: 'Make main' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Make another Course main first' })).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('CoursesPage: reorder', () => {
  it('moves a Course with the keyboard on its handle and PUTs the new order of the active Courses', async () => {
    const api = routes(ADMIN_ME, { 'PUT /api/courses/order': { courses: activeCourses } })
    await show()
    within(rowOf('Side')).getByRole('button', { name: 'Reorder Side' }).focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.keyboard(' ')
    await waitFor(() => expect(api.callsTo('PUT', '/api/courses/order')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/courses/order')[0]!.body).toEqual({ ids: [2, 1, 3, 4] })
  })

  it('a drop in the same place asks for nothing', async () => {
    const api = routes()
    await show()
    within(rowOf('Side')).getByRole('button', { name: 'Reorder Side' }).focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard(' ')
    expect(api.callsTo('PUT', '/api/courses/order')).toHaveLength(0)
  })
})

const deleted = { value: false }
beforeEach(() => { deleted.value = false })

describe('CoursesPage: Delete and Archive', () => {
  const impactRoute = { 'GET /api/courses/2/impact': sideImpact }

  it('Delete opens the impact dialog and DELETEs with the replacement', async () => {
    const api = routes(ADMIN_ME, { ...impactRoute, 'DELETE /api/courses/2?replacement=1': { status: 204 } })
    await show()
    await menuFor('Side', 'Delete')
    const dialog = await screen.findByRole('dialog', { name: 'Delete Side?' })
    expect(await within(dialog).findByText('Side is on 8 Recipes and 3 Meal Slots.')).toBeInTheDocument()
    expect(within(dialog).getByText('3 Recipes and 2 Meal Slots have only Side: give them Main')).toBeInTheDocument()
    const meals = within(within(dialog).getByRole('list', { name: 'Planned Meals that go, from today on' })).getAllByRole('listitem')
    expect(meals[0]).toHaveTextContent('Pinned')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete Course' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/courses/2?replacement=1')).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await findNotice('status', 'Deleted Side.')).toBeInTheDocument()
  })

  // Rule (design note 3.2): after a removal focus goes to the Actions button of the row that takes the removed row's place
  // (the next one), else the previous row, else the list itself (tabIndex -1).
  it('after Delete, focus is on the Actions button of the next row', async () => {
    routes(ADMIN_ME, { ...impactRoute, 'DELETE /api/courses/2?replacement=1': { status: 204 } }, () => allCourses.filter((c) => c.id !== 2 || deleted.value === false))
    await show()
    await menuFor('Side', 'Delete')
    const dialog = await screen.findByRole('dialog', { name: 'Delete Side?' })
    deleted.value = true
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Delete Course' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Starter' })).toHaveFocus())
  })

  it('after Delete of the last row, focus is on the previous row\'s Actions button', async () => {
    routes(ADMIN_ME, { 'GET /api/courses/4/impact': { ...sideImpact, plannedMeals: [] }, 'DELETE /api/courses/4?replacement=1': { status: 204 } }, () => allCourses.filter((c) => c.id !== 4 || deleted.value === false))
    await show()
    await menuFor('Dessert', 'Delete')
    const dialog = await screen.findByRole('dialog', { name: 'Delete Dessert?' })
    deleted.value = true
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Delete Course' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Starter' })).toHaveFocus())
  })

  it('after Archive, focus is on the Actions button of the next row', async () => {
    routes(ADMIN_ME, {
      ...impactRoute,
      'DELETE /api/courses/2?replacement=1': { status: 409, json: { error: { code: 'course_planned', message: 'planned' } } },
      'POST /api/courses/2/archive': { ...activeCourses[1], archived: true },
    }, () => allCourses.map((c) => (c.id === 2 && deleted.value ? { ...c, archived: true } : c)))
    await show()
    await menuFor('Side', 'Delete')
    const dialog = await screen.findByRole('dialog', { name: 'Delete Side?' })
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Delete Course' }))
    const archive = await screen.findByRole('dialog', { name: 'Archive Side?' })
    deleted.value = true
    await userEvent.click(within(archive).getByRole('button', { name: 'Archive Course' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Actions for Starter' })).toHaveFocus())
  })

  it('a Course that was planned offers Archive with the same replacement', async () => {
    const api = routes(ADMIN_ME, {
      ...impactRoute,
      'DELETE /api/courses/2?replacement=1': { status: 409, json: { error: { code: 'course_planned', message: 'planned' } } },
      'POST /api/courses/2/archive': { ...activeCourses[1], archived: true },
    })
    await show()
    await menuFor('Side', 'Delete')
    const dialog = await screen.findByRole('dialog', { name: 'Delete Side?' })
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Delete Course' }))
    const archive = await screen.findByRole('dialog', { name: 'Archive Side?' })
    await userEvent.click(within(archive).getByRole('button', { name: 'Archive Course' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/courses/2/archive')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/courses/2/archive')[0]!.body).toEqual({ replacementId: 1 })
    expect(await findNotice('status', 'Archived Side.')).toBeInTheDocument()
  })

  it('Cancel changes nothing', async () => {
    const api = routes(ADMIN_ME, impactRoute)
    await show()
    await menuFor('Side', 'Delete')
    const dialog = await screen.findByRole('dialog', { name: 'Delete Side?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api.calls.some((c) => c.method === 'DELETE' || c.method === 'POST')).toBe(false)
  })
})

describe('CoursesPage: Unarchive', () => {
  it('puts an archived Course back and says it is last', async () => {
    const api = routes(ADMIN_ME, { 'POST /api/courses/5/unarchive': { ...brunchCourse, archived: false } })
    await show()
    await userEvent.click(screen.getByRole('button', { name: 'Archived Courses (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Brunch' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/courses/5/unarchive')).toHaveLength(1))
    expect(await findNotice('status', 'Brunch is back in the list, last.')).toBeInTheDocument()
  })

  it('says why when the list is full (too_many_courses)', async () => {
    routes(ADMIN_ME, { 'POST /api/courses/5/unarchive': { status: 422, json: { error: { code: 'too_many_courses', message: 'The list holds 20 Courses.' } } } })
    await show()
    await userEvent.click(screen.getByRole('button', { name: 'Archived Courses (1)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Brunch' }))
    expect(await findNotice('alert', 'The list holds 20 Courses. Delete or archive one to add another.')).toBeInTheDocument()
  })
})
