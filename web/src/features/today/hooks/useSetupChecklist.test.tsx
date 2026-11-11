import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as seam from '../setupSeam'
import { useSetupChecklist } from './useSetupChecklist'

vi.mock('../setupSeam', () => ({ useSetupFacts: vi.fn() }))

const brandNew = { members: 0, mealSlots: 0, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 0, unplannedMeals: 0 }
const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

describe('useSetupChecklist', () => {
  beforeEach(() => vi.mocked(seam.useSetupFacts).mockReset())

  it('turns the facts into the checklist and passes loading through', () => {
    vi.mocked(seam.useSetupFacts).mockReturnValue({ facts: { ...brandNew, members: 1 }, loading: false })
    const { result } = renderHook(() => useSetupChecklist(), { wrapper })
    expect(result.current.loading).toBe(false)
    expect(result.current.checklist.visible).toBe(true)
    expect(result.current.checklist.steps.find((s) => s.current)!.id).toBe('attendance')
  })

  it('while loading there is nothing to show', () => {
    vi.mocked(seam.useSetupFacts).mockReturnValue({ facts: null, loading: true })
    const { result } = renderHook(() => useSetupChecklist(), { wrapper })
    expect(result.current.loading).toBe(true)
    expect(result.current.checklist.visible).toBe(false)
  })

  it('goTo opens the step\'s page', () => {
    vi.mocked(seam.useSetupFacts).mockReturnValue({ facts: brandNew, loading: false })
    let path = ''
    function Probe() {
      path = useLocation().pathname
      return null
    }
    const { result } = renderHook(() => useSetupChecklist(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <MemoryRouter>
          <Probe />
          {children}
        </MemoryRouter>
      ),
    })
    act(() => result.current.goTo(result.current.checklist.steps[0]!))
    expect(path).toBe('/settings/members')
  })
})
