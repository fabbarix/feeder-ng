import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, refusal, summaryJSON, wrapper, type RecordedCall } from '../../../lib/baseRecipes/test-utils'
import { setBaseRecipe } from '../lib/baseRecipe'
import { newKey, type LineDraft } from '../lib/draft'
import { recipe } from '../fixtures.test-helper'
import { useRecipeEditor } from './useRecipeEditor'

// BR-D: the editor's save of a Base recipe, the refusals and the take-over ask (API shapes: internal/recipe/httpapi/base_test.go).
const line = (over: Partial<LineDraft> = {}): LineDraft => ({ key: newKey('t'), ingredientId: 9, ingredientName: 'milk', quantity: '1000', unit: 'ml', optional: false, note: '', ...over })
const fillBase = (result: { current: ReturnType<typeof useRecipeEditor> }, over: Partial<ReturnType<typeof useRecipeEditor>['draft']> = {}) =>
  act(() => result.current.setDraft((d) => ({ ...setBaseRecipe(d, true), name: 'Béchamel', yield: '1', yieldUnit: 'l', lines: [line()], ...over })))
const ask = refusal(409, 'base_recipe_take_over', { ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 1, name: 'Lasagne' }], stockLots: 1, convertible: true })

describe('useRecipeEditor: saving a Base recipe', () => {
  it('creates it with the kind, the Yield unit and no Courses', async () => {
    const api = mockApi({ 'POST /api/recipes': { status: 201, json: summaryJSON({ id: 2 }) } })
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fillBase(result)
    await act(async () => { await result.current.save() })
    expect(api.callsTo('POST', '/api/recipes')[0]?.body).toMatchObject({ name: 'Béchamel', baseRecipe: true, yield: 1, yieldUnit: 'l', courseIds: [] })
  })

  it('saves a Base recipe with no Ingredients (it is made empty and filled in later)', async () => {
    const api = mockApi({ 'POST /api/recipes': { status: 201, json: summaryJSON({ id: 2 }) } })
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fillBase(result, { lines: [] })
    await act(async () => { await result.current.save() })
    expect(result.current.errors).toEqual({})
    expect(api.callsTo('POST', '/api/recipes')).toHaveLength(1)
  })
})

describe('useRecipeEditor: the take-over ask (409 base_recipe_take_over)', () => {
  it('saves nothing and keeps the ask while the User has not answered', async () => {
    const api = mockApi({ 'POST /api/recipes': ask })
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fillBase(result)
    let out: unknown = 'x'
    await act(async () => { out = await result.current.save() })
    expect(out).toBeNull()
    expect(result.current.takeOverAsk).toMatchObject({ ingredient: { id: 5, name: 'béchamel' }, stockLots: 1, convertible: true })
    expect(api.callsTo('POST', '/api/recipes')).toHaveLength(1)
  })

  it.each([true, false])('answer %s saves again with takeOver, and the ask goes', async (yes) => {
    let n = 0
    const api = mockApi({ 'POST /api/recipes': () => ((n += 1) === 1 ? ask : { status: 201, json: summaryJSON({ id: 2 }) }) })
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fillBase(result)
    await act(async () => { await result.current.save() })
    let out: { id?: number } | null = null
    await act(async () => { out = await result.current.answerTakeOver(yes) })
    expect(api.callsTo('POST', '/api/recipes')[1]?.body).toMatchObject({ takeOver: yes })
    expect(out).toMatchObject({ id: 2 })
    expect(result.current.takeOverAsk).toBeNull()
  })

  it('Escape forgets the ask and saves nothing', async () => {
    const api = mockApi({ 'POST /api/recipes': ask })
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fillBase(result)
    await act(async () => { await result.current.save() })
    act(() => result.current.cancelTakeOver())
    expect(result.current.takeOverAsk).toBeNull()
    expect(api.callsTo('POST', '/api/recipes')).toHaveLength(1)
  })

  it('a rename asks the same on PUT', async () => {
    const stored = recipe({ id: 2, name: 'Béchamel', baseRecipe: true, yieldUnit: 'l', yield: 1, courses: [], baseIngredientId: 30, usedBy: [], within: [] })
    mockApi({ 'GET /api/recipes/2': stored, 'GET /api/slot-rules': [], 'GET /api/meal-slots': [], 'PUT /api/recipes/2': ask })
    const { result } = renderHook(() => useRecipeEditor(2), { wrapper })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    act(() => result.current.setDraft((d) => ({ ...d, name: 'White sauce' })))
    await act(async () => { await result.current.save() })
    expect(result.current.takeOverAsk).not.toBeNull()
  })
})

describe('useRecipeEditor: refusals (cycle, name taken)', () => {
  it('words a cycle from the path and puts the line in errors', async () => {
    mockApi({ 'POST /api/recipes': refusal(422, 'validation_failed', { field: 'lines[1]', reason: 'base_recipe_cycle', path: ['Roux', 'Béchamel', 'Roux'] }) })
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fillBase(result, { lines: [line(), line({ ingredientName: 'Béchamel', baseRecipeId: 2 })] })
    await act(async () => { await result.current.save() })
    expect(result.current.refusal).toBe('Roux calls for Béchamel, which calls for Roux')
    expect(result.current.errors).toHaveProperty(['lines.1'], 'base_recipe_cycle')
  })

  it.each([
    ['base_recipe_name_taken', 'Another Base recipe already has this name. Choose a different name.'],
    ['ready_meal_name_taken', 'A Ready Meal already has this name. Choose a different name.'],
  ])('%s sits on the name field with its words', async (reason, words) => {
    mockApi({ 'POST /api/recipes': refusal(422, 'validation_failed', { field: 'name', reason }) })
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fillBase(result)
    await act(async () => { await result.current.save() })
    expect(result.current.errors).toHaveProperty('name', reason)
    expect(result.current.refusal).toBe(words)
  })

  it('clears the refusal on the next save', async () => {
    let n = 0
    mockApi({ 'POST /api/recipes': (_c: RecordedCall) => ((n += 1) === 1 ? refusal(422, 'validation_failed', { field: 'name', reason: 'base_recipe_name_taken' }) : { status: 201, json: summaryJSON({ id: 2 }) }) })
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    fillBase(result)
    await act(async () => { await result.current.save() })
    await act(async () => { await result.current.save() })
    expect(result.current.refusal).toBeNull()
  })
})

describe('useRecipeEditor: line links in the draft', () => {
  it('links and unlinks a draft line (saved with the Recipe)', () => {
    mockApi({})
    const { result } = renderHook(() => useRecipeEditor(), { wrapper })
    act(() => result.current.setDraft((d) => ({ ...d, lines: [line({ key: 'k', ingredientId: 5, ingredientName: 'béchamel', quantity: '500', unit: 'ml' })] })))
    act(() => result.current.linkLine('k', { id: 3, name: 'Béchamel', ingredientId: 30 }))
    expect(result.current.draft.lines[0]).toMatchObject({ baseRecipeId: 3, ingredientId: 30, linkedFromIngredientId: 5, quantity: '500' })
    act(() => result.current.unlinkLine('k', { id: 5, name: 'béchamel', baseUnit: 'ml', conversions: [] }))
    expect(result.current.draft.lines[0]).toMatchObject({ ingredientId: 5, quantity: '500' })
    expect(result.current.draft.lines[0]?.baseRecipeId ?? null).toBeNull()
  })
})
