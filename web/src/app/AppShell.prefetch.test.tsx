// B9-59 (RES-04): a nav link of the bottom bar or the side rail asks for its route's code on pointerdown and on focus.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))

function setup(onNavIntent?: (path: string) => void) {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} onNavIntent={onNavIntent} />, children: [{ index: true, element: <p>Today</p> }] }],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

describe('AppShell nav intent', () => {
  it.each(['Bottom bar', 'Side rail'])('%s: pointerdown and focus on a link name its path', (nav) => {
    const onNavIntent = vi.fn()
    setup(onNavIntent)
    const bar = screen.getByRole('navigation', { name: nav })
    fireEvent.pointerDown(within(bar).getByRole('link', { name: 'Plan' }))
    expect(onNavIntent).toHaveBeenLastCalledWith('/plan')
    fireEvent.focus(within(bar).getByRole('link', { name: 'Scan' }))
    expect(onNavIntent).toHaveBeenLastCalledWith('/scan')
  })

  it('without a handler the links work as before', () => {
    setup()
    expect(() => fireEvent.pointerDown(within(screen.getByRole('navigation', { name: 'Bottom bar' })).getByRole('link', { name: 'Plan' }))).not.toThrow()
  })
})
