// B9-49 (RES-07): the shell hands the queue to its status slot (Scans and Ticks) and puts the slot where the banner can stick: it is
// one element, `.app-status`, a direct child of .app-shell (the sticky banner's grid cell), and absent from chromeless screens.
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('./ShellTimers', () => ({ ShellTimers: () => null }))
vi.mock('./ShellStatus', () => ({
  ShellStatus: (p: { pendingScans?: number; pendingTicks?: number }) => <div data-testid="shell-status" data-scans={p.pendingScans} data-ticks={p.pendingTicks} />,
}))

function mount(path: string, props: { pendingScans?: number; pendingTicks?: number } = {}) {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} {...props} />, children: [{ path: '*', element: <p>page</p> }] }],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
}

describe('AppShell status slot', () => {
  it('passes the waiting Scans and Ticks to the status slot', () => {
    mount('/plan', { pendingScans: 2, pendingTicks: 1 })
    expect(screen.getByTestId('shell-status')).toHaveAttribute('data-scans', '2')
    expect(screen.getByTestId('shell-status')).toHaveAttribute('data-ticks', '1')
  })

  it('the slot is .app-status, a direct child of .app-shell, after the top bar and before <main>', () => {
    mount('/plan')
    const slot = screen.getByTestId('shell-status').parentElement!
    expect(slot).toHaveClass('app-status')
    expect(slot.parentElement).toHaveClass('app-shell')
    const kids = [...slot.parentElement!.children]
    expect(kids.indexOf(slot)).toBeGreaterThan(kids.findIndex((e) => e.matches('header.top-bar')))
    expect(kids.indexOf(slot)).toBeLessThan(kids.findIndex((e) => e.matches('main')))
  })

  it('chromeless screens have no status slot', () => {
    mount('/board')
    expect(screen.queryByTestId('shell-status')).toBeNull()
  })
})
