// B9-21 (RES-10): AppUpdate is the one place the update toast is wired: it renders nothing, sums the features' waiting Scans and
// Ticks (the same useShellStatus hooks AppRoot calls) into useAppUpdate, and sits beside AppRoot in main.tsx.
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppUpdate } from './AppUpdate'
import { useAppUpdate } from './useAppUpdate'

vi.mock('./useAppUpdate', () => ({ useAppUpdate: vi.fn() }))

const renderIt = (statusHooks?: Array<() => { pendingScans?: number; pendingAccessRequests?: number }>) =>
  render(
    <MemoryRouter>
      <AppUpdate statusHooks={statusHooks} />
    </MemoryRouter>,
  )

beforeEach(() => vi.mocked(useAppUpdate).mockReset())

describe('AppUpdate', () => {
  it('renders nothing', () => {
    const { container } = renderIt([])
    expect(container).toBeEmptyDOMElement()
  })

  it('with no status hooks nothing is waiting', () => {
    renderIt()
    expect(vi.mocked(useAppUpdate).mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ pendingSyncCount: 0 }))
  })

  it('passes the waiting Scans and Ticks, summed over the features, to useAppUpdate', () => {
    renderIt([() => ({ pendingScans: 2 }), () => ({ pendingScans: 3, pendingAccessRequests: 9 }), () => ({})])
    expect(vi.mocked(useAppUpdate).mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ pendingSyncCount: 5 }))
  })

  it('B9-49: Ticks held for sync hold the prompt back too (pendingTicks is summed with pendingScans)', () => {
    renderIt([() => ({ pendingScans: 1, pendingTicks: 2 }), () => ({ pendingTicks: 3 })] as never)
    expect(vi.mocked(useAppUpdate).mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ pendingSyncCount: 6 }))
  })

  it('an access request is not a sync: it does not hold the prompt back', () => {
    renderIt([() => ({ pendingAccessRequests: 4 })])
    expect(vi.mocked(useAppUpdate).mock.calls.at(-1)![0]).toEqual(expect.objectContaining({ pendingSyncCount: 0 }))
  })
})
