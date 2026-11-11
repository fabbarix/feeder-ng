import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../ui'
import { match, plan, prompt, recipe, reviewExtras } from '../fixtures.test-helper'
import { importStrings as s } from '../strings'
import type { UseImportReview } from '../hooks/useImportReview'

const hook = vi.hoisted(() => ({ current: {} as UseImportReview }))
vi.mock('../hooks/useImportReview', () => ({ useImportReview: () => hook.current }))

import { ImportScreen } from './ImportScreen'

function state(over: Partial<UseImportReview>): UseImportReview {
  return {
    phase: 'source', plan: undefined, decisions: { ingredients: [], conversions: [], recipes: [] }, error: undefined, busy: false, stale: false,
    result: undefined, open: vi.fn(), chooseExisting: vi.fn(), chooseCreate: vi.fn(), answerConversion: vi.fn(), chooseRecipeAction: vi.fn(),
    confirm: vi.fn(), reset: vi.fn(), ...reviewExtras(), ...over,
  }
}
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
  it('guides the import as four numbered steps: Read a recipe, the Agent Prompt, the file, then the review', () => {
    view()
    expect(screen.getByRole('heading', { level: 1, name: s.importTitle })).toBeInTheDocument()
    expect(screen.getByText(s.stepOverline(1))).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Read a recipe' })).toBeInTheDocument()
    expect(screen.getByText(s.stepOverline(2))).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: s.stepOneTitle })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: s.copyAgentPrompt })).toBeInTheDocument()
    expect(screen.getByText(s.stepOverline(3))).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: s.stepTwoTitle })).toBeInTheDocument()
    expect(screen.getByText(s.stepOverline(4))).toBeInTheDocument()
  })
  it('step 4 is a Tile with an overline and its heading, like the other steps (before and during the review)', () => {
    const { rerender } = view()
    const tileOf = (n: number) => screen.getByText(s.stepOverline(n)).closest('.tile')
    for (const n of [1, 2, 3, 4]) expect(tileOf(n), `step ${n}`).not.toBeNull()
    expect(within(tileOf(4) as HTMLElement).getByRole('heading', { name: s.stepThreeTitle })).toBeInTheDocument()
    expect(screen.getByText(s.stepOverline(4))).toHaveClass('tile__overline')
    hook.current = state({ phase: 'reviewing', plan: plan() })
    rerender(<MemoryRouter><ToastProvider><ImportScreen /></ToastProvider></MemoryRouter>)
    expect(within(tileOf(4) as HTMLElement).getByRole('heading', { name: s.stepThreeTitle })).toBeInTheDocument()
  })
  it('starts with the source step and passes the text to the review', async () => {
    view()
    await userEvent.click(screen.getByLabelText(s.pasteLabel))
    await userEvent.paste('{}')
    await userEvent.click(screen.getByRole('button', { name: s.review }))
    expect(hook.current.open).toHaveBeenCalledWith('{}')
  })
  it('shows validation errors and no review tiles when the file is refused', () => {
    hook.current = state({ error: { kind: 'schema', errors: [{ path: '$.recipes', message: 'at least 1' }] } })
    view()
    expect(screen.getByText(/\$\.recipes/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: s.confirm })).not.toBeInTheDocument()
  })
  it('shows a tile per open question while reviewing and wires the answers', async () => {
    hook.current = state({
      phase: 'reviewing',
      plan: plan({
        ready: false,
        ingredients: [match({ key: 'onion', name: 'onion', status: 'conflict', resolved: false, effective: undefined, match: { id: 5, name: 'onion', baseUnit: 'g' }, conflict: { file: 'piece', existing: 'g' } })],
        unitPrompts: [prompt()],
        recipes: [recipe({ status: 'conflict', resolved: false })],
        warnings: [{ path: '$.recipes[0].image', code: 'image_failed', message: 'private address' }],
      }),
    })
    view()
    expect(screen.getByText(s.conflictText('piece', 'g'))).toBeInTheDocument()
    expect(screen.getByText(s.unitPrompt('handful', 'spinach'))).toBeInTheDocument()
    expect(screen.getByText(s.conflictTitle('Chicken tikka traybake'))).toBeInTheDocument()
    expect(screen.getByText('$.recipes[0].image')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: s.confirm })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: s.useExisting('onion') }))
    expect(hook.current.chooseExisting).toHaveBeenCalledWith('onion', 5)
    await userEvent.click(screen.getByRole('button', { name: s.skip }))
    expect(hook.current.chooseRecipeAction).toHaveBeenCalledWith(0, 'skip')
    await userEvent.type(screen.getByRole('spinbutton', { name: s.unitAmountLabel('g') }), '30')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: s.saveConversion }))
    expect(hook.current.answerConversion).toHaveBeenCalledWith('spinach', 'handful', 30)
  })
  it('confirms when ready', async () => {
    hook.current = state({ phase: 'reviewing', plan: plan({ ingredients: [match({ key: 'lemon' })] }) })
    view()
    await userEvent.click(screen.getByRole('button', { name: s.confirm }))
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
    await userEvent.click(screen.getByRole('button', { name: s.startOver }))
    expect(hook.current.reset).toHaveBeenCalledOnce()
  })
})
