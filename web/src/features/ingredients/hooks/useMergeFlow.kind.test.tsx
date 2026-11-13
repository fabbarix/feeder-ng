// H5: merging stays inside one kind: the candidates are asked for by the source's kind; kind_differs is a block.
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, refusal, wrapper } from '../../../lib/baseRecipes/test-utils'
import { dishSoapJSON, garlicJSON, toiletPaperJSON } from '../supply.test-helper'
import type { MergePreview } from '../types'
import { useMergeFlow } from './useMergeFlow'

const preview = (over: Partial<MergePreview> = {}): MergePreview => ({
  source: dishSoapJSON, target: garlicJSON, blocked: '', conversions: [], shelfLifeDays: null, conflicts: [],
  sourceReferences: {}, targetReferences: {}, ...over,
})

describe('useMergeFlow(sourceId, kind)', () => {
  it('lists only candidates of the source kind (GET ?kind=supply)', async () => {
    const api = mockApi({ 'GET /api/ingredients?kind=supply': [dishSoapJSON, toiletPaperJSON] })
    const { result } = renderHook(() => useMergeFlow(21, 'supply'), { wrapper })
    await waitFor(() => expect(result.current.candidates.map((c) => c.name)).toEqual(['toilet paper']))
    expect(api.callsTo('GET', '/api/ingredients?kind=supply')).toHaveLength(1)
  })
  it('searches within the kind (GET /search?q=&kind=supply)', async () => {
    const api = mockApi({
      'GET /api/ingredients?kind=supply': [dishSoapJSON, toiletPaperJSON],
      'GET /api/ingredients/search?q=toilet&kind=supply': { exact: toiletPaperJSON, suggestions: [] },
    })
    const { result } = renderHook(() => useMergeFlow(21, 'supply'), { wrapper })
    act(() => result.current.setQuery('toilet'))
    await waitFor(() => expect(result.current.candidates.map((c) => c.name)).toEqual(['toilet paper']))
    expect(api.callsTo('GET', '/api/ingredients/search?q=toilet&kind=supply')).toHaveLength(1)
  })
  it('defaults to food', async () => {
    const api = mockApi({ 'GET /api/ingredients?kind=food': [garlicJSON] })
    renderHook(() => useMergeFlow(7), { wrapper })
    await waitFor(() => expect(api.callsTo('GET', '/api/ingredients?kind=food')).toHaveLength(1))
  })
  it('cannot merge when the preview is blocked as kind_differs', async () => {
    mockApi({
      'GET /api/ingredients?kind=supply': [toiletPaperJSON],
      'GET /api/ingredients/21/merge-preview?into=22': preview({ target: toiletPaperJSON, blocked: 'kind_differs' }),
    })
    const { result } = renderHook(() => useMergeFlow(21, 'supply'), { wrapper })
    await waitFor(() => expect(result.current.candidates).toHaveLength(1))
    act(() => result.current.selectTarget(toiletPaperJSON))
    await waitFor(() => expect(result.current.preview?.blocked).toBe('kind_differs'))
    expect(result.current.canMerge).toBe(false)
  })
  it('reloads the preview when the merge itself answers 409 kind_differs', async () => {
    const api = mockApi({
      'GET /api/ingredients?kind=supply': [toiletPaperJSON],
      'GET /api/ingredients/21/merge-preview?into=22': preview({ target: toiletPaperJSON }),
      'POST /api/ingredients/21/merge': refusal(409, 'kind_differs'),
    })
    const { result } = renderHook(() => useMergeFlow(21, 'supply'), { wrapper })
    await waitFor(() => expect(result.current.candidates).toHaveLength(1))
    act(() => result.current.selectTarget(toiletPaperJSON))
    await waitFor(() => expect(result.current.canMerge).toBe(true))
    await expect(result.current.merge()).rejects.toMatchObject({ code: 'kind_differs' })
    await waitFor(() => expect(api.callsTo('GET', '/api/ingredients/21/merge-preview?into=22').length).toBeGreaterThan(1))
  })
})
