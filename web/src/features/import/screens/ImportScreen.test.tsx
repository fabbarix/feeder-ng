import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { match, plan, prompt, recipe, reviewExtras, courseExtras } from '../fixtures.test-helper'
import { importStrings as s } from '../strings'
import type { UseImportReview } from '../hooks/useImportReview'

const hook = vi.hoisted(() => ({ current: {} as UseImportReview }))
vi.mock('../hooks/useImportReview', () => ({ useImportReview: () => hook.current }))

import { ImportScreen } from './ImportScreen'

function state(over: Partial<UseImportReview>): UseImportReview {
  return {
    phase: 'source', plan: undefined, decisions: { ingredients: [], conversions: [], recipes: [], courses: [] }, error: undefined, busy: false, stale: false,
    result: undefined, open: vi.fn(), chooseExisting: vi.fn(), chooseCreate: vi.fn(), answerConversion: vi.fn(), chooseRecipeAction: vi.fn(),
    confirm: vi.fn(), reset: vi.fn(), ...reviewExtras(), ...courseExtras(), ...over,
  }
}
vi.mock('../hooks/usePhotoPages', async () => (await import('../fakePhotoPages.test-helper')).fakePhotoPagesModule())
vi.mock('../hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))
// WP-E: the Read a recipe step (its own tests: ImportScreen.read.test.tsx)
vi.mock('../hooks/useRecipeRead', () => ({
  useRecipeRead: () => ({ phase: 'idle', busy: false, kind: undefined, state: undefined, error: undefined, elapsedSeconds: 0, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
}))
vi.mock('../hooks/useReadAvailability', () => ({
  useReadAvailability: () => ({ loading: false, enabled: true, isAdmin: false, statusFailed: false, settingsLink: false, photos: true, retry: vi.fn() }),
}))
const view = () => render(<MemoryRouter><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)

describe('ImportScreen', () => {
  beforeEach(() => {
    hook.current = state({})
  })
  // The numbered steps are gone (RX-11): ImportScreen.rx.test.tsx covers the two paths.
  it('shows the page title', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: s.importTitle })).toBeInTheDocument()
  })
  it('starts with the file tile and passes the pasted text to the review', async () => {
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Paste the JSON instead' }))
    await userEvent.click(screen.getByLabelText('Recipe File JSON'))
    await userEvent.paste('{}')
    await userEvent.click(screen.getByRole('button', { name: s.review }))
    expect(hook.current.open).toHaveBeenCalledWith('{}')
  })
  it('shows validation errors and no review tiles when the file is refused', () => {
    hook.current = state({ error: { kind: 'schema', errors: [{ path: '$.recipes', message: 'at least 1' }] } })
    view()
    expect(screen.getByText(/\$\.recipes/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Import actions' })).not.toBeInTheDocument()
  })
  it('shows a row per open question while reviewing and wires the answers', async () => {
    hook.current = state({
      phase: 'reviewing',
      plan: plan({
        ready: false,
        ingredients: [
          match({ key: 'onion', name: 'onion', status: 'conflict', resolved: false, effective: undefined, match: { id: 5, name: 'onion', baseUnit: 'g' }, conflict: { file: 'piece', existing: 'g' } }),
          match({ key: 'spinach', name: 'spinach', status: 'new' }),
        ],
        unitPrompts: [prompt()],
        recipes: [recipe({ status: 'conflict', resolved: false })],
        warnings: [{ path: '$.recipes[0].image', code: 'image_failed', message: 'private address' }],
      }),
    })
    view()
    expect(screen.getByText(s.conflictText('piece', 'g'))).toBeInTheDocument()
    expect(screen.getByText('How many g is 1 handful?')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'What to do with Chicken tikka traybake' })).toBeInTheDocument()
    expect(screen.getByText('$.recipes[0].image')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: s.useExisting('Onion') }))
    expect(hook.current.chooseExisting).toHaveBeenCalledWith('onion', 5)
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }))
    expect(hook.current.chooseRecipeAction).toHaveBeenCalledWith(0, 'skip')
    await userEvent.type(screen.getByRole('spinbutton', { name: '1 handful of Spinach is' }), '30')
    await userEvent.click(screen.getByRole('button', { name: s.saveConversion }))
    expect(hook.current.answerConversion).toHaveBeenCalledWith('spinach', 'handful', 30)
  })
  it('imports when ready', async () => {
    hook.current = state({ phase: 'reviewing', plan: plan({ ingredients: [match({ key: 'lemon' })] }) })
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Import 1 Recipe' }))
    expect(hook.current.confirm).toHaveBeenCalledOnce()
  })
  it('says what happened when done, and links on', () => {
    hook.current = state({ phase: 'done', plan: plan(), result: { recipes: [{ index: 0, id: 9, name: 'A', action: 'created' }, { index: 1, id: 10, name: 'B', action: 'replaced' }], ingredientsCreated: 3, conversionsAdded: 1 } })
    view()
    expect(screen.getByText(s.done(2))).toBeInTheDocument()
    expect(screen.getByRole('link', { name: s.openRecipes })).toHaveAttribute('href', '/recipes')
  })
  it('asks to start over when the data changed during the review', async () => {
    hook.current = state({ phase: 'reviewing', plan: plan(), stale: true })
    view()
    expect(screen.getByText(s.stale)).toBeInTheDocument()
    const tile = screen.getByText(s.stale).closest('[role="alert"]') as HTMLElement
    await userEvent.click(within(tile).getByRole('button', { name: s.startOver }))
    expect(hook.current.reset).toHaveBeenCalledOnce()
  })
})

// CRS E2: the screen reads the Courses of the household; these tests do not care which.
vi.mock('../hooks/useImportCourses', () => ({ useImportCourses: () => ({ courses: [], isAdmin: false, isPending: false }) }))
