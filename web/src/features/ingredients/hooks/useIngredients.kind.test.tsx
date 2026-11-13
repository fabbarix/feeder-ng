// H5: the list hook asks for one kind (food by default), so the Ingredients list never holds a Supply (decision D5).
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { mockApi, wrapper } from '../../../lib/baseRecipes/test-utils'
import { dishSoapJSON, garlicJSON, toiletPaperJSON } from '../supply.test-helper'
import { useIngredients } from './useIngredients'

describe('useIngredients(query, kind)', () => {
  it('asks GET /api/ingredients?kind=food by default', async () => {
    const api = mockApi({ 'GET /api/ingredients?kind=food': [garlicJSON] })
    const { result } = renderHook(() => useIngredients(''), { wrapper })
    await waitFor(() => expect(result.current.ingredients).toHaveLength(1))
    expect(api.callsTo('GET', '/api/ingredients?kind=food')).toHaveLength(1)
    expect(api.calls.map((c) => c.path)).not.toContain('/api/ingredients')
  })
  it('asks GET /api/ingredients?kind=supply for the Supplies list and filters it by the query', async () => {
    const api = mockApi({ 'GET /api/ingredients?kind=supply': [toiletPaperJSON, dishSoapJSON] })
    const { result } = renderHook(() => useIngredients('soap', 'supply'), { wrapper })
    await waitFor(() => expect(result.current.ingredients.map((i) => i.name)).toEqual(['dish soap']))
    expect(api.callsTo('GET', '/api/ingredients?kind=supply')).toHaveLength(1)
    expect(result.current.isEmpty).toBe(false)
  })
  it('tells "no Supplies yet" from "no match"', async () => {
    mockApi({ 'GET /api/ingredients?kind=supply': [] })
    const { result } = renderHook(() => useIngredients('', 'supply'), { wrapper })
    await waitFor(() => expect(result.current.isEmpty).toBe(true))
  })
  it('keeps the two kinds in separate caches (one query client)', async () => {
    mockApi({ 'GET /api/ingredients?kind=food': [garlicJSON], 'GET /api/ingredients?kind=supply': [dishSoapJSON] })
    const food = renderHook(() => useIngredients('', 'food'), { wrapper })
    await waitFor(() => expect(food.result.current.ingredients.map((i) => i.name)).toEqual(['garlic']))
    const supplies = renderHook(() => useIngredients('', 'supply'), { wrapper })
    await waitFor(() => expect(supplies.result.current.ingredients.map((i) => i.name)).toEqual(['dish soap']))
    expect(food.result.current.ingredients.map((i) => i.name)).toEqual(['garlic'])
  })
  it('creates with the kind it is given', async () => {
    const api = mockApi({ 'GET /api/ingredients?kind=supply': [], 'POST /api/ingredients': { ...dishSoapJSON, id: 30 } })
    const { result } = renderHook(() => useIngredients('', 'supply'), { wrapper })
    await waitFor(() => expect(result.current.isEmpty).toBe(true))
    await result.current.create({ name: 'dish soap', baseUnit: 'ml', kind: 'supply', restockLevel: 500 })
    expect(api.callsTo('POST', '/api/ingredients')[0]?.body).toEqual({ name: 'dish soap', baseUnit: 'ml', kind: 'supply', restockLevel: 500 })
  })
})
