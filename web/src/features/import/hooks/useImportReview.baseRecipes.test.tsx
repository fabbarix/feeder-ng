// BR-E: Base recipe answers and the Confirm refusals in useImportReview (design §11.3, §13). RED until the hook has them.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../lib/http'
import { applied, baseLine, confirmed, takeOver, useSuggestion } from '../fixtures.baseRecipes.test-helper'
import { plan } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ open: vi.fn(), plan: vi.fn(), confirm: vi.fn(), discard: vi.fn(), agentPrompt: vi.fn(), recipes: vi.fn() }))
vi.mock('../api', () => ({ importApi: api }))

import { useImportReview } from './useImportReview'

const path = '$.recipes[0].ingredients[1]'
const open = plan({ ready: false, baseRecipeLines: [baseLine({ suggestions: [useSuggestion(3, 'Béchamel', false)] })], takeOvers: [takeOver()] })
const answered = plan({ ready: true, baseRecipeLines: [baseLine({ resolved: true, effective: { action: 'create' } })], takeOvers: [takeOver({ resolved: true, answer: false })] })

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return renderHook(() => useImportReview(), { wrapper })
}
async function reviewing() {
  const hook = setup()
  await act(() => hook.result.current.open('{}'))
  return hook
}

describe('useImportReview, Base recipe answers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.open.mockResolvedValue({ id: 'r1', plan: open })
    api.plan.mockResolvedValue({ id: 'r1', plan: answered })
    api.confirm.mockResolvedValue(confirmed([applied()]))
    api.discard.mockResolvedValue(undefined)
  })

  it('answering a tile asks the server for the plan with baseRecipeLines', async () => {
    const { result } = await reviewing()
    await act(async () => result.current.chooseBaseRecipeLine(path, { action: 'create', readNext: true }))
    expect(api.plan).toHaveBeenCalledWith('r1', expect.objectContaining({ baseRecipeLines: { [path]: { action: 'create', readNext: true } } }))
    expect(result.current.plan).toEqual(answered)
  })

  it('answering a take-over ask asks for the plan with takeOvers', async () => {
    const { result } = await reviewing()
    await act(async () => result.current.chooseTakeOver(path, true))
    expect(api.plan).toHaveBeenCalledWith('r1', expect.objectContaining({ takeOvers: { [path]: true } }))
  })

  it('Confirm sends every Base recipe answer', async () => {
    const { result } = await reviewing()
    await act(async () => result.current.chooseBaseRecipeLine(path, { action: 'keep' }))
    await act(() => result.current.confirm())
    expect(api.confirm).toHaveBeenCalledWith('r1', expect.objectContaining({ baseRecipeLines: { [path]: { action: 'keep' } } }))
    expect(result.current.phase).toBe('done')
  })

  it('keeps the Confirm answer (baseRecipe, line, readNext) for the follow-ups', async () => {
    const created = confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line: path, readNext: true })])
    api.confirm.mockResolvedValue(created)
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    expect(result.current.result).toEqual(created)
  })
})

describe('useImportReview, Confirm refusals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.open.mockResolvedValue({ id: 'r1', plan: answered })
    api.plan.mockResolvedValue({ id: 'r1', plan: answered })
    api.discard.mockResolvedValue(undefined)
  })

  it('422 base_recipe_cycle: the review stays open and the cycle is named at the top', async () => {
    api.confirm.mockRejectedValue(new ApiError(422, 'base_recipe_cycle', 'Béchamel calls for Roux, which calls for Béchamel', { path: ['Béchamel', 'Roux', 'Béchamel'] }))
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    expect(result.current.phase).toBe('reviewing')
    expect(result.current.plan).toEqual(answered)
    expect(result.current.error).toBeUndefined()
    expect(result.current.confirmProblem).toEqual({
      kind: 'cycle',
      message: 'Béchamel calls for Roux, which calls for Béchamel',
      path: ['Béchamel', 'Roux', 'Béchamel'],
    })
  })

  it('the next answer clears the refusal', async () => {
    api.confirm.mockRejectedValue(new ApiError(422, 'base_recipe_cycle', 'x', { path: ['A', 'B', 'A'] }))
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    await act(async () => result.current.chooseBaseRecipeLine(path, { action: 'keep' }))
    expect(result.current.confirmProblem).toBeUndefined()
  })

  it('422 validation_failed base_recipe_kind: the review stays open with the reason', async () => {
    api.confirm.mockRejectedValue(new ApiError(422, 'validation_failed', 'a Base recipe cannot be planned', { field: 'baseRecipe', reason: 'base_recipe_kind' }))
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    expect(result.current.phase).toBe('reviewing')
    expect(result.current.confirmProblem).toEqual({ kind: 'validation', reason: 'base_recipe_kind', message: 'A Base recipe cannot be planned.' })
  })

  it('422 import_not_ready: shows the server\'s plan and says so at the top', async () => {
    const server = plan({ ready: false, baseRecipeLines: [baseLine()] })
    api.confirm.mockRejectedValue(new ApiError(422, 'import_not_ready', 'Finish the Import Review before confirming', { plan: server }))
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    expect(result.current.plan).toEqual(server)
    expect(result.current.confirmProblem).toEqual({ kind: 'notReady', message: 'Finish the Import Review before confirming', plan: server })
  })

  describe('409 base_recipe_take_over (the Recipe API shape)', () => {
    const ask = new ApiError(409, 'base_recipe_take_over', 'an Ingredient named béchamel exists: take it over?', {
      ingredient: { id: 5, name: 'béchamel' },
      recipes: [{ id: 11, name: 'Moussaka', archived: false }],
      stockLots: 1,
      convertible: true,
    })

    it('opens the take-over dialog for the Base recipe whose ask names that Ingredient; nothing is sent yet', async () => {
      api.open.mockResolvedValue({ id: 'r1', plan: open })
      api.confirm.mockRejectedValueOnce(ask)
      const { result } = await reviewing()
      await act(() => result.current.confirm())
      expect(result.current.phase).toBe('reviewing')
      expect(result.current.takeOverPrompt).toEqual({
        path,
        baseName: 'Béchamel',
        ask: { ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 11, name: 'Moussaka' }], stockLots: 1, convertible: true },
      })
      expect(api.confirm).toHaveBeenCalledTimes(1)
    })

    it('Yes answers the ask with true, then confirms again', async () => {
      api.open.mockResolvedValue({ id: 'r1', plan: open })
      api.confirm.mockRejectedValueOnce(ask).mockResolvedValueOnce(confirmed([applied()]))
      const { result } = await reviewing()
      await act(() => result.current.confirm())
      await act(() => result.current.answerTakeOverPrompt(true))
      expect(api.confirm).toHaveBeenLastCalledWith('r1', expect.objectContaining({ takeOvers: { [path]: true } }))
      expect(result.current.takeOverPrompt).toBeUndefined()
      expect(result.current.phase).toBe('done')
    })

    it('No answers it with false', async () => {
      api.open.mockResolvedValue({ id: 'r1', plan: open })
      api.confirm.mockRejectedValueOnce(ask).mockResolvedValueOnce(confirmed([applied()]))
      const { result } = await reviewing()
      await act(() => result.current.confirm())
      await act(() => result.current.answerTakeOverPrompt(false))
      expect(api.confirm).toHaveBeenLastCalledWith('r1', expect.objectContaining({ takeOvers: { [path]: false } }))
    })

    it('Escape closes it and saves nothing', async () => {
      api.open.mockResolvedValue({ id: 'r1', plan: open })
      api.confirm.mockRejectedValueOnce(ask)
      const { result } = await reviewing()
      await act(() => result.current.confirm())
      act(() => result.current.cancelTakeOverPrompt())
      expect(result.current.takeOverPrompt).toBeUndefined()
      expect(api.confirm).toHaveBeenCalledTimes(1)
      expect(result.current.phase).toBe('reviewing')
    })
  })
})

describe('useImportReview, a 409 take-over the plan has no ask for (round 2)', () => {
  const stray = new ApiError(409, 'base_recipe_take_over', 'an Ingredient named béchamel exists: take it over?', {
    ingredient: { id: 5, name: 'béchamel' },
    recipes: [{ id: 11, name: 'Moussaka', archived: false }],
    stockLots: 1,
    convertible: true,
  })
  const withAsk = plan({ ready: false, baseRecipeLines: [baseLine({ resolved: true, effective: { action: 'create' } })], takeOvers: [takeOver()] })

  beforeEach(() => {
    vi.clearAllMocks()
    api.open.mockResolvedValue({ id: 'r1', plan: plan({ ready: true, baseRecipeLines: [baseLine({ resolved: true, effective: { action: 'create' } })], takeOvers: [] }) })
    api.plan.mockResolvedValue({ id: 'r1', plan: withAsk })
    api.confirm.mockRejectedValue(stray)
    api.discard.mockResolvedValue(undefined)
  })

  it('plans again with the current answers, so the ask shows on its tile', async () => {
    const { result } = await reviewing()
    await act(async () => result.current.chooseBaseRecipeLine(path, { action: 'create' }))
    api.plan.mockClear()
    await act(() => result.current.confirm())
    expect(api.plan).toHaveBeenCalledWith('r1', expect.objectContaining({ baseRecipeLines: { [path]: { action: 'create' } } }))
    expect(result.current.plan).toEqual(withAsk)
    expect(result.current.phase).toBe('reviewing')
  })

  it('opens no dialog and shows no problem: there is no question to answer first', async () => {
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    expect(result.current.takeOverPrompt).toBeUndefined()
    expect(result.current.confirmProblem).toBeUndefined()
    expect(result.current.error).toBeUndefined()
  })

  it('does not confirm again by itself', async () => {
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    expect(api.confirm).toHaveBeenCalledTimes(1)
  })
})

describe('useImportReview, Read it next', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.open.mockResolvedValue({ id: 'r1', plan: answered })
    api.confirm.mockResolvedValue(confirmed([applied({ id: 3, name: 'Béchamel', baseRecipe: true, line: path, readNext: true })]))
    api.discard.mockResolvedValue(undefined)
  })

  it('starts a new read for the created Base recipe: back to the source step, remembering which one', async () => {
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    await act(() => result.current.startReadNext({ recipeId: 3, name: 'Béchamel', line: path }))
    expect(result.current.phase).toBe('source')
    expect(result.current.plan).toBeUndefined()
    expect(result.current.result).toBeUndefined()
    expect(result.current.readNextFor).toEqual({ recipeId: 3, name: 'Béchamel', line: path })
  })

  it('Start over forgets it', async () => {
    const { result } = await reviewing()
    await act(() => result.current.confirm())
    await act(() => result.current.startReadNext({ recipeId: 3, name: 'Béchamel', line: path }))
    await act(() => result.current.reset())
    expect(result.current.readNextFor).toBeUndefined()
  })
})
