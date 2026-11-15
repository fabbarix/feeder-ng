import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageErrorBoundary } from './PageErrorBoundary'

// B9-20 (RES-09): the page boundary's Try again works. It resets the route's queries and the boundary; on "/" the second
// action is Reload Feeder, because "Go to Today" from Today does nothing. (PageErrorBoundary.tsx is not in B9-20's Owns
// list: the plan's build notes name it; the main session settles who edits it.)
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

function Boom(): never {
  throw new Error('kaboom')
}

function mountAt(path: string, page: React.ReactNode, client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })) {
  const router = createMemoryRouter([{ path: '*', element: <PageErrorBoundary resetKey={path}>{page}</PageErrorBoundary> }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, client }
}

describe('PageErrorBoundary actions', () => {
  it('Try again is the primary action, with Go to Today as the secondary, on a page other than Today', () => {
    mountAt('/plan', <Boom />)
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('Feeder could not show this page. Your data is safe.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to Today' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reload page' })).toBeNull()
  })

  it('on Today the secondary is Reload Feeder, never a Go to Today that does nothing', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    mountAt('/', <Boom />)
    expect(screen.queryByRole('button', { name: 'Go to Today' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Reload Feeder' }))
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('Try again resets the boundary and the route\'s queries: cached bad data is cleared and refetched, then the page renders', async () => {
    const good = vi.fn().mockResolvedValue({ slots: [] })
    function Plan() {
      const q = useQuery({ queryKey: ['plan', 'view'], queryFn: good })
      if (!q.data) return <p>loading plan</p>
      if ((q.data as { bad?: boolean }).bad) throw new Error('malformed')
      return <p>Plan ok</p>
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(['plan', 'view'], { bad: true })
    mountAt('/plan', <Plan />, client)
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Plan ok')).toBeInTheDocument()
    expect(good).toHaveBeenCalled()
  })

  it('Try again never resets the signed-in User', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(['me'], { id: 1 })
    mountAt('/plan', <Boom />, client)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(client.getQueryData(['me'])).toEqual({ id: 1 })
  })

  it('moves focus to the error heading on render (the page error is announced and reachable)', () => {
    mountAt('/plan', <Boom />)
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toHaveFocus()
  })
})
