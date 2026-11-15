// B9-48 test support (not product code): the providers every Ingredient page needs now (Toast for Undo and "Saved Keeping for …",
// the Confirm host for the leave guard, react-query for the impact read) around a DATA router (useLeaveGuard needs one).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { ConfirmProvider, ToastProvider } from '../../ui'

export function renderRoutes(routes: RouteObject[], entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  const view = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { router, client, ...view }
}

/** The page's real alerts: the empty live region of the ToastProvider (role="alert", class toast-live) is not one. */
export const alerts = (): HTMLElement[] => screen.queryAllByRole('alert').filter((e) => !e.classList.contains('toast-live'))
/** Waits for exactly one real alert and returns it. */
export const findAlert = (): Promise<HTMLElement> =>
  waitFor(() => {
    const found = alerts()
    if (found.length !== 1) throw new Error(`expected one alert, found ${found.length}`)
    return found[0]!
  })
