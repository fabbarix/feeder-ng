import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoot } from './AppRoot'

afterEach(() => vi.unstubAllGlobals())

function mount(path: string, me: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(me))
  const router = createMemoryRouter([{ path: '/', element: <AppRoot />, children: [{ path: 'plan', element: <p>plan page</p> }] }], { initialEntries: [path] })
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const unauthenticated = () => new Response(JSON.stringify({ error: { code: 'unauthenticated', message: 'x' } }), { status: 401 })

describe('AppRoot signed out', () => {
  it('shows the Google sign-in page', async () => {
    mount('/', unauthenticated())
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/auth/google/login')
  })

  it('shows the not-invited page after Google refuses the account', async () => {
    mount('/not-invited', unauthenticated())
    expect(await screen.findByRole('heading', { name: 'Not invited' })).toBeInTheDocument()
  })

  it('shows why a sign-in failed', async () => {
    mount('/sign-in?error=denied', unauthenticated())
    expect(await screen.findByRole('alert')).toHaveTextContent(/cancelled/i)
  })
})

describe('AppRoot signed in', () => {
  it('shows the shell and the routed page', async () => {
    mount('/plan', new Response(JSON.stringify({ id: 1, email: 'a@example.test', displayName: 'Anna Rossi', isAdmin: false }), { status: 200 }))
    expect(await screen.findByText('plan page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your menu' })).toBeInTheDocument()
  })
})
