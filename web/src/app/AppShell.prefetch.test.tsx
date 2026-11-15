// B9-59 (RES-04): a nav link of the bottom bar or the side rail asks for its route's code on pointerdown and on focus.
import { bottomBarNav, sideRailNav } from '../test/shellNav'
import { fireEvent, render, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'

vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))
// int1: AppShell mounts the shell timers since B9-25 (they read the timers through react-query): mocked, as every AppShell test does.
vi.mock('./ShellTimers', () => ({ ShellTimers: () => null }))

function setup(onNavIntent?: (path: string) => void) {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} onNavIntent={onNavIntent} />, children: [{ index: true, element: <p>Today</p> }] }],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

describe('AppShell nav intent', () => {
  it.each([['bottom bar', bottomBarNav], ['side rail', sideRailNav]] as const)('%s: pointerdown and focus on a link name its path', (_name, nav) => {
    const onNavIntent = vi.fn()
    setup(onNavIntent)
    const bar = nav()
    fireEvent.pointerDown(within(bar).getByRole('link', { name: 'Plan' }))
    expect(onNavIntent).toHaveBeenLastCalledWith('/plan')
    fireEvent.focus(within(bar).getByRole('link', { name: 'Scan' }))
    expect(onNavIntent).toHaveBeenLastCalledWith('/scan')
  })

  it('without a handler the links work as before', () => {
    setup()
    expect(() => fireEvent.pointerDown(within(bottomBarNav()).getByRole('link', { name: 'Plan' }))).not.toThrow()
  })
})
