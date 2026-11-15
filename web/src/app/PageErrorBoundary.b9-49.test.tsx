// B9-49 (RES-09 page, TB-15c, A11Y-01): the page boundary.
//   TB-15c  the page error is the shared ErrorState (danger tone, role="alert", the warning icon), not an accent EmptyState; its heading,
//           text and both actions are inside it.
//   A11Y-01 the document is titled "Something went wrong · Feeder" while it shows.
//   RES-09  "Coming back to a route removes that route's cached queries that errored, through the same reset": leaving a crashed page and
//           coming back with the cached bad data still in the cache does not crash it again.
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Link, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageErrorBoundary } from './PageErrorBoundary'

beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

function Boom(): never {
  throw new Error('kaboom')
}

function Frame() {
  const { pathname } = useLocation()
  return (
    <>
      <Link to="/plan">to plan</Link> <Link to="/pantry">to pantry</Link>
      <PageErrorBoundary resetKey={pathname}>
        <Outlet />
      </PageErrorBoundary>
    </>
  )
}
const mount = (children: { path: string; element: React.ReactNode }[], path: string, client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })) => {
  const router = createMemoryRouter([{ path: '/', element: <Frame />, children }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, client }
}
/** The page error's own alert: the toast region's empty live regions are not it (`.toast-live`). */
const pageAlert = () => document.querySelector<HTMLElement>('[role="alert"]:not(.toast-live)')

describe('TB-15c: the page error is an ErrorState', () => {
  it('is a danger status tile with role="alert" holding the heading, the text, and both actions', () => {
    mount([{ path: 'plan', element: <Boom /> }], '/plan')
    const alert = pageAlert()!
    expect(alert).not.toBeNull()
    expect(alert).toHaveClass('error-state')
    expect(alert).toContainElement(screen.getByRole('heading', { name: 'Something went wrong' }))
    expect(alert).toHaveTextContent('Feeder could not show this page. Your data is safe.')
    expect(alert).toContainElement(screen.getByRole('button', { name: 'Try again' }))
    expect(alert).toContainElement(screen.getByRole('button', { name: 'Go to Today' }))
  })

  it('carries the warning icon (decoration), and the heading still takes focus on render', () => {
    mount([{ path: 'plan', element: <Boom /> }], '/plan')
    expect(pageAlert()!.querySelector('svg')).not.toBeNull()
    expect(pageAlert()!.querySelector('.error-state__icon')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toHaveFocus()
  })

  it('is not an EmptyState (no accent empty-state tile)', () => {
    mount([{ path: 'plan', element: <Boom /> }], '/plan')
    expect(document.querySelector('.empty-state')).toBeNull()
  })
})

describe('A11Y-01: the error names the document', () => {
  it('"Something went wrong · Feeder" while the page error shows', () => {
    document.title = 'Plan · Feeder'
    mount([{ path: 'plan', element: <Boom /> }], '/plan')
    expect(document.title).toBe('Something went wrong · Feeder')
  })
})

describe('RES-09: coming back to a crashed route', () => {
  it('leaving the crashed page resets its queries, so cached bad data does not crash it again on return', async () => {
    const good = vi.fn().mockResolvedValue({ slots: [] })
    function Plan() {
      const q = useQuery({ queryKey: ['plan', 'view'], queryFn: good })
      if (!q.data) return <p>loading plan</p>
      if ((q.data as { bad?: boolean }).bad) throw new Error('malformed')
      return <p>Plan ok</p>
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(['plan', 'view'], { bad: true })
    mount([{ path: 'plan', element: <Plan /> }, { path: 'pantry', element: <p>Pantry ok</p> }], '/plan', client)
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'to pantry' }))
    expect(await screen.findByText('Pantry ok')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'to plan' }))
    expect(await screen.findByText('Plan ok')).toBeInTheDocument()
    expect(good).toHaveBeenCalled()
  })

  it('never resets the signed-in User on the way', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(['me'], { id: 1 })
    mount([{ path: 'plan', element: <Boom /> }, { path: 'pantry', element: <p>Pantry ok</p> }], '/plan', client)
    await userEvent.click(screen.getByRole('link', { name: 'to pantry' }))
    await screen.findByText('Pantry ok')
    expect(client.getQueryData(['me'])).toEqual({ id: 1 })
  })
})
