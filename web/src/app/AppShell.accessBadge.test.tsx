import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'
import { buildRoutes } from './features'

// A1: the shell shows how many sign-in requests wait, on the avatar button and again inside the menu.
function setup(extra: Record<string, unknown>) {
  const shellProps = { user: { displayName: 'Anna Rossi' }, onSignOut: () => {}, ...extra }
  const router = createMemoryRouter([{ path: '/', element: <AppShell {...shellProps} />, children: buildRoutes({}) }], { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
}

describe('AppShell access badge', () => {
  it('shows a count badge on the avatar button and names it for screen readers', () => {
    setup({ pendingAccessRequests: 3 })
    expect(screen.getByRole('button', { name: /your menu.*3 sign-in requests waiting/i })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('shows no badge when nobody waits', () => {
    setup({ pendingAccessRequests: 0 })
    expect(screen.getByRole('button', { name: 'Your menu' })).toBeInTheDocument()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('adds a "Sign-in requests" item to the avatar menu when some wait', async () => {
    setup({ pendingAccessRequests: 2 })
    await userEvent.click(screen.getByRole('button', { name: /your menu/i }))
    expect(screen.getByRole('menuitem', { name: /sign-in requests/i })).toHaveAttribute('href', '/settings/access-requests')
  })
})
