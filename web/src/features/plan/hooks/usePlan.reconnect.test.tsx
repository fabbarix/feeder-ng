// B9-20 (RES-02), reviewer: the plan comes back by itself when the connection returns, even with the passive
// ['plan', 'view'] reader of useCookContext mounted beside it. A reader without a queryFn made the paused retry run with
// "Missing queryFn", so on the real server the Plan stayed on "The plan could not be loaded." after reconnecting.
import { act, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createQueryClient } from '../../../app/providers'
import { comeBack, goOffline } from '../../../test/offlineHarness'
import { useCookContext } from './useCookContext'
import { usePlan } from './usePlan'

function Probe() {
  const plan = usePlan()
  useCookContext(false)
  return <p data-testid="state">{plan.state}</p>
}

beforeEach(() => {
  vi.useFakeTimers()
  goOffline()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('offlineUnknown turns into ready by itself when the connection returns', async () => {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Probe />
    </QueryClientProvider>,
  )
  await act(async () => void (await vi.advanceTimersByTimeAsync(1500)))
  expect(screen.getByTestId('state')).toHaveTextContent('offlineUnknown')
  comeBack(() => ({ slots: [], today: '2026-11-14', updating: false, from: '2026-11-14', to: '2026-11-20' }))
  await act(async () => void (await vi.advanceTimersByTimeAsync(1500)))
  expect(screen.getByTestId('state')).toHaveTextContent('ready')
})
