// CRS E2: Course rows, the Admin-only answers, the 403 and the Course limit in the Import Review screen (docs/dev/design/crs-e2.md 4.5).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { courseChoices } from '../../recipes/fixtures.test-helper'
import { courseExtras, courseRow, plan, recipe, reviewExtras } from '../fixtures.test-helper'
import type { UseImportReview } from '../hooks/useImportReview'
import { importStrings as s } from '../strings'

const h = vi.hoisted(() => ({ review: {} as UseImportReview, admin: true }))
vi.mock('../hooks/useImportReview', () => ({ useImportReview: () => h.review }))
vi.mock('../hooks/useImportCourses', () => ({ useImportCourses: () => ({ courses: courseChoices, isAdmin: h.admin, isPending: false }) }))
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../hooks/useRecipeRead', () => ({
  useRecipeRead: () => ({ phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
}))
vi.mock('../hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }),
}))

import { ImportScreen } from './ImportScreen'

function state(over: Partial<UseImportReview>): UseImportReview {
  return {
    phase: 'reviewing', plan: undefined, decisions: { ingredients: [], conversions: [], recipes: [], courses: [] }, error: undefined, busy: false, stale: false,
    result: undefined, open: vi.fn(), chooseExisting: vi.fn(), chooseCreate: vi.fn(), answerConversion: vi.fn(), chooseRecipeAction: vi.fn(),
    confirm: vi.fn(), reset: vi.fn(), ...reviewExtras(), ...courseExtras(), ...over,
  }
}
const view = () => render(<MemoryRouter><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)

const recipes = [recipe({ index: 0, name: 'Pancakes' }), recipe({ index: 1, name: 'Trifle' })]
const rows = [
  courseRow({ key: 'side', name: 'Side', status: 'exact', match: { id: 2, name: 'Side', main: false, archived: false } }),
  courseRow({ key: 'soup', name: 'Soup', usedBy: ['$.recipes[0].courses[0]', '$.recipes[1].courses[1]'] }),
  courseRow({ key: 'brunch', name: 'Brunch', status: 'archived', match: { id: 9, name: 'Brunch', main: false, archived: true }, usedBy: ['$.recipes[1].courses[0]'] }),
]

beforeEach(() => {
  h.admin = true
  h.review = state({ plan: plan({ recipes, courses: rows }) })
})

describe('ImportScreen Course rows', () => {
  it('shows a tile for each unknown and archived name, and none for a matched one', () => {
    view()
    expect(screen.getByRole('region', { name: 'Soup' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Brunch' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Side' })).toBeNull()
  })
  it('has no Courses area when every name matched', () => {
    h.review = state({ plan: plan({ recipes, courses: [rows[0]!] }) })
    view()
    expect(screen.queryByRole('region', { name: 'Soup' })).toBeNull()
    expect(screen.queryByText(s.courses.title)).toBeNull()
  })
  it('names the Recipes behind each name', () => {
    view()
    expect(within(screen.getByRole('region', { name: 'Soup' })).getByText('Used by Pancakes, Trifle')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Brunch' })).getByText('Used by Trifle')).toBeInTheDocument()
  })
  it('puts the Course tiles after the Ingredients and before a Recipe conflict', () => {
    h.review = state({ plan: plan({ recipes: [recipe({ index: 0, name: 'Pancakes', status: 'conflict', resolved: false })], courses: rows }) })
    view()
    const soup = screen.getByRole('region', { name: 'Soup' })
    const conflict = screen.getByRole('heading', { name: s.conflictTitle('Pancakes') })
    expect(soup.compareDocumentPosition(conflict) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('ImportScreen Course answers', () => {
  it('choosing a Course in the select answers use', async () => {
    view()
    await userEvent.click(within(screen.getByRole('region', { name: 'Soup' })).getByRole('combobox', { name: s.courses.useLabel }))
    await userEvent.click(screen.getByRole('option', { name: /Dessert/ }))
    expect(h.review.chooseCourseUse).toHaveBeenCalledWith('soup', 4)
  })
  it('Skip, Add and Unarchive answer for their own name', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Skip Soup' }))
    expect(h.review.chooseCourseSkip).toHaveBeenCalledWith('soup')
    await userEvent.click(screen.getByRole('button', { name: 'Add Soup as a Course' }))
    expect(h.review.chooseCourseAdd).toHaveBeenCalledWith('soup')
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Brunch' }))
    expect(h.review.chooseCourseUnarchive).toHaveBeenCalledWith('brunch')
  })
  it('a non-Admin is not offered Add or Unarchive', () => {
    h.admin = false
    view()
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Unarchive / })).toBeNull()
    expect(screen.getByRole('button', { name: 'Skip Soup' })).toBeInTheDocument()
  })
})

describe('ImportScreen: 403 and the Course limit', () => {
  const limit = { path: '$.recipes[0].courses[0]', code: 'too_many_courses', message: 'too many' }
  /** The inline danger Tile that holds `text`: the Toast live region is another alert and is not it. */
  const inlineAlert = (text: string) => screen.getByText(text).closest('[role=alert]') as HTMLElement
  const inToastRegion = (el: Element) => el.closest('[aria-live]') !== null
  const sibling = (a: HTMLElement, b: HTMLElement) => a.parentElement === b.parentElement

  it('after a refused Confirm, an inline danger Tile says only an Admin can add or unarchive, and the Review stays open', () => {
    h.review = state({ plan: plan({ recipes, courses: rows }), courseForbidden: true })
    view()
    const tile = inlineAlert(s.courses.forbidden)
    expect(tile).toHaveTextContent(s.courses.forbidden)
    expect(tile).toHaveClass('tile')
    expect(tile).toHaveAttribute('data-status', 'danger')
    expect(inToastRegion(tile)).toBe(false)
    expect(screen.getByRole('region', { name: 'Soup' })).toBeInTheDocument()
  })
  it('puts the 403 Tile next to the Course tiles, in the same grid', () => {
    h.review = state({ plan: plan({ recipes, courses: rows }), courseForbidden: true })
    view()
    expect(sibling(inlineAlert(s.courses.forbidden), screen.getByRole('region', { name: 'Soup' }))).toBe(true)
  })
  it('uses no toast for the 403 notice', () => {
    h.review = state({ plan: plan({ recipes, courses: rows }), courseForbidden: true })
    view()
    expect(screen.getAllByText(s.courses.forbidden)).toHaveLength(1)
  })
  it('the 403 Tile goes away when its state clears, after the next answer', () => {
    h.review = state({ plan: plan({ recipes, courses: rows }), courseForbidden: true })
    const { rerender } = view()
    expect(screen.getByText(s.courses.forbidden)).toBeInTheDocument()
    h.review = state({ plan: plan({ recipes, courses: rows }), courseForbidden: false })
    rerender(<MemoryRouter><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)
    expect(screen.queryByText(s.courses.forbidden)).toBeNull()
  })
  it('has no such alert otherwise', () => {
    view()
    expect(screen.queryByText(s.courses.forbidden)).toBeNull()
  })
  it('explains too_many_courses in an inline danger Tile beside the Course rows, with the limit of 20', () => {
    h.review = state({ plan: plan({ ready: false, recipes, courses: rows, problems: [limit] }) })
    view()
    const tile = inlineAlert(s.courses.tooMany(20))
    expect(tile).toHaveAttribute('data-status', 'danger')
    expect(inToastRegion(tile)).toBe(false)
    expect(sibling(tile, screen.getByRole('region', { name: 'Soup' }))).toBe(true)
  })
  it('uses no toast for the limit notice', () => {
    h.review = state({ plan: plan({ ready: false, recipes, courses: rows, problems: [limit] }) })
    view()
    expect(screen.getAllByText(s.courses.tooMany(20))).toHaveLength(1)
  })
  it('the limit Tile goes away when the plan no longer passes 20', () => {
    h.review = state({ plan: plan({ ready: false, recipes, courses: rows, problems: [limit] }) })
    const { rerender } = view()
    expect(screen.getByText(s.courses.tooMany(20))).toBeInTheDocument()
    h.review = state({ plan: plan({ recipes, courses: rows, problems: [] }) })
    rerender(<MemoryRouter><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)
    expect(screen.queryByText(s.courses.tooMany(20))).toBeNull()
  })
  it('does not repeat it in the generic list of Problems', () => {
    h.review = state({ plan: plan({ ready: false, recipes, courses: rows, problems: [limit] }) })
    view()
    expect(screen.queryByRole('heading', { name: s.errorsTitle })).toBeNull()
    expect(screen.queryByText('too many')).toBeNull()
  })
  it('keeps other Problems in the generic list', () => {
    h.review = state({ plan: plan({ ready: false, recipes, courses: rows, problems: [limit, { path: '$.recipes[0].courses[1]', code: 'course_name_invalid', message: 'blank name' }] }) })
    view()
    expect(screen.getByRole('heading', { name: s.errorsTitle })).toBeInTheDocument()
    expect(screen.getByText('blank name')).toBeInTheDocument()
  })
})

describe('ImportScreen done', () => {
  const done = (result: Partial<NonNullable<UseImportReview['result']>>) =>
    state({ phase: 'done', result: { recipes: [{ index: 0, id: 1, name: 'A', action: 'created' }], ingredientsCreated: 0, conversionsAdded: 0, ...result } })
  it('says which Courses were added and brought back', () => {
    h.review = done({ coursesCreated: 2, coursesUnarchived: 1 })
    view()
    expect(screen.getByText('Added 2 Courses')).toBeInTheDocument()
    expect(screen.getByText('Brought back 1 Course')).toBeInTheDocument()
  })
  it('says nothing about Courses when none changed', () => {
    h.review = done({ coursesCreated: 0 })
    view()
    expect(screen.queryByText(/Added \d+ Course/)).toBeNull()
    expect(screen.queryByText(/Brought back/)).toBeNull()
  })
})
