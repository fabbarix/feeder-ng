// B5-F1: the upcoming dates that differ come from the plan.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, wrapper } from '../test-utils'
import { useDateExceptions } from './useDateExceptions'

afterEach(() => vi.unstubAllGlobals())

describe('useDateExceptions', () => {
  it('derives the exceptions from GET /api/plan', async () => {
    mockApi({
      'GET /api/plan': {
        slots: [
          { date: '2026-11-11', mealSlotId: 4, name: 'Dinner', time: '19:30', usualTime: '19:30', notServed: true, guests: 0 },
          { date: '2026-11-12', mealSlotId: 4, name: 'Dinner', time: '20:15', usualTime: '19:30', notServed: false, guests: 2 },
          { date: '2026-11-13', mealSlotId: 4, name: 'Dinner', time: '19:30', usualTime: '19:30', notServed: false, guests: 0 },
        ],
      },
    })
    const { result } = renderHook(() => useDateExceptions(), { wrapper })
    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(result.current.map((e) => e.date)).toEqual(['2026-11-11', '2026-11-12'])
  })

  it('is empty when the plan cannot be read', async () => {
    const api = mockApi({ 'GET /api/plan': { status: 500, json: { error: { code: 'internal', message: 'x' } } } })
    const { result } = renderHook(() => useDateExceptions(), { wrapper })
    await waitFor(() => expect(api.callsTo('GET', '/api/plan').length).toBeGreaterThan(0))
    expect(result.current).toEqual([])
  })
})
