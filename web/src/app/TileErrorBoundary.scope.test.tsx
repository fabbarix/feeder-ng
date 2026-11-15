// B9-20 (RES-09), reviewer: Try again on one crashed tile resets only that tile's queries; a neighbour keeps its data and
// is not asked again.
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TileErrorBoundary } from './TileErrorBoundary'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

it('resets only the crashed tile’s keys; the other tile keeps its data and makes no request', async () => {
  const toConfirm = vi.fn().mockResolvedValue({ slots: [] })
  const lines = vi.fn().mockResolvedValue({ n: 18 })
  function ToConfirm() {
    const q = useQuery({ queryKey: ['plan', 'to-confirm'], queryFn: toConfirm })
    if ((q.data as { bad?: boolean } | undefined)?.bad) throw new Error('malformed')
    return <h2>To confirm</h2>
  }
  function Lines() {
    const q = useQuery({ queryKey: ['shopping', 'count'], queryFn: lines })
    return <h2>{q.data ? `${(q.data as { n: number }).n} Lines to get` : 'Lines to get'}</h2>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  client.setQueryData(['plan', 'to-confirm'], { bad: true })
  client.setQueryData(['shopping', 'count'], { n: 18 })
  render(
    <QueryClientProvider client={client}>
      <TileErrorBoundary title="To confirm" queryKeys={[['plan', 'to-confirm']]}>
        <ToConfirm />
      </TileErrorBoundary>
      <TileErrorBoundary title="Lines to get" queryKeys={[['shopping']]}>
        <Lines />
      </TileErrorBoundary>
    </QueryClientProvider>,
  )
  expect(screen.getByRole('alert', { name: 'To confirm' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '18 Lines to get' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { name: 'To confirm' })).toBeInTheDocument()
  expect(toConfirm).toHaveBeenCalledTimes(1)
  expect(lines).not.toHaveBeenCalled()
  expect(client.getQueryData(['shopping', 'count'])).toEqual({ n: 18 })
})
