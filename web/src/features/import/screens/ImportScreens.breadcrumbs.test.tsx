// R11a (DEFERRED with the Recipe screens: wire after R12 merges). Import (all phases, incl. the review) and Export show
// Recipes > Import Recipes / Export Recipes and no back IconButton.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { plan, reviewExtras, courseExtras } from '../fixtures.test-helper'
import type { UseExportPicker } from '../hooks/useExportPicker'
import type { UseImportReview } from '../hooks/useImportReview'

const hook = vi.hoisted(() => ({ review: {} as UseImportReview, picker: {} as UseExportPicker }))
vi.mock('../hooks/useImportReview', () => ({ useImportReview: () => hook.review }))
vi.mock('../hooks/useExportPicker', () => ({ useExportPicker: () => hook.picker }))
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
vi.mock('../hooks/useRecipeRead', () => ({
  useRecipeRead: () => ({ phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
}))
vi.mock('../hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }),
}))

import { ExportScreen } from './ExportScreen'
import { ImportScreen } from './ImportScreen'

const review = (over: Partial<UseImportReview>): UseImportReview => ({
  phase: 'source', plan: undefined, decisions: { ingredients: [], conversions: [], recipes: [], courses: [] }, error: undefined, busy: false, stale: false,
  result: undefined, open: vi.fn(), chooseExisting: vi.fn(), chooseCreate: vi.fn(), answerConversion: vi.fn(), chooseRecipeAction: vi.fn(),
  confirm: vi.fn(), reset: vi.fn(), ...reviewExtras(), ...courseExtras(), ...over,
})
const at = (path: string, ui: React.ReactElement) => render(<MemoryRouter initialEntries={[path]}><ToastProvider>{ui}</ToastProvider></MemoryRouter>)
const trail = () => screen.getByRole('navigation', { name: 'Breadcrumb' })

beforeEach(() => {
  hook.review = review({})
  hook.picker = { recipes: [], isLoading: false, error: null, selected: [], toggle: vi.fn(), selectAll: vi.fn(), clear: vi.fn(), href: '/api/recipe-file/export?all=1' }
})

describe('Import and Export breadcrumbs', () => {
  it.each([
    ['source', review({})],
    ['review (Import Review)', review({ phase: 'reviewing', plan: plan() })],
  ])('Import, %s phase: Recipes > Import Recipes above the h1; no Back button', (_name, state) => {
    hook.review = state
    const { container } = at('/recipes/import', <ImportScreen />)
    expect(trail().querySelector('a[href="/recipes"]')).toHaveTextContent('Recipes')
    expect(trail().querySelector('[aria-current="page"]')).toHaveTextContent('Import Recipes')
    expect(container.querySelector('.page-header')).toContainElement(trail())
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('Export: Recipes > Export Recipes; no Back button', () => {
    at('/recipes/export', <ExportScreen />)
    expect(trail().querySelector('a[href="/recipes"]')).toHaveTextContent('Recipes')
    expect(trail().querySelector('[aria-current="page"]')).toHaveTextContent('Export Recipes')
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })
})

// CRS E2: the screen reads the Courses of the household; these tests do not care which.
vi.mock('../hooks/useImportCourses', () => ({ useImportCourses: () => ({ courses: [], isAdmin: false, isPending: false }) }))
