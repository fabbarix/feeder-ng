// B9-25 (PC-04): where the shell mounts the timer pill. In the framed pages (every route except Cook Mode, the board and the receipt
// screens, which are chromeless) ShellTimers is a direct child of .app-shell, after the top bar, outside <main>, mounted once so it
// survives navigation. In the chromeless frame it is not mounted at all, so the hook does not poll or ring there (Cook Mode runs its
// own timers and alarm; the board shows its own).
import { render } from '@testing-library/react'
import { createElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ mounts: 0 }))
vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))
vi.mock('./ShellTimers', () => ({
  ShellTimers: () => {
    calls.mounts += 1
    return <div data-testid="shell-timers" className="shell-timer-probe" />
  },
}))

import { AppShell } from './AppShell'

function at(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />,
        children: ['plan', 'pantry', 'board', 'cook/recipe/12', 'scan/receipt'].map((p) => ({ path: p, element: createElement('h1', null, p) })),
      },
    ],
    { initialEntries: [path] },
  )
  return { router, ...render(<RouterProvider router={router} />) }
}

describe('AppShell mounts the timer pill (PC-04)', () => {
  it('in the framed pages: one ShellTimers, a child of .app-shell, after the top bar and outside main', () => {
    calls.mounts = 0
    const { container } = at('/plan')
    const probes = container.querySelectorAll('.shell-timer-probe')
    expect(probes).toHaveLength(1)
    const probe = probes[0]!
    expect(probe.parentElement).toBe(container.querySelector('.app-shell'))
    expect(container.querySelector('header.top-bar')!.compareDocumentPosition(probe) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('main')!.contains(probe)).toBe(false)
  })

  it('it stays mounted while the cook moves between framed pages (one mount, so one poll and one alarm)', async () => {
    calls.mounts = 0
    const { router, container } = at('/plan')
    const first = container.querySelector('.shell-timer-probe')
    expect(first).not.toBeNull()
    await router.navigate('/pantry')
    expect(container.querySelector('.shell-timer-probe')).toBe(first)
  })

  it('not in Cook Mode', () => {
    calls.mounts = 0
    const { container } = at('/cook/recipe/12')
    expect(container.querySelector('.shell-timer-probe')).toBeNull()
    expect(calls.mounts).toBe(0)
  })

  it('not on the kitchen board (it shows its own timers)', () => {
    calls.mounts = 0
    const { container } = at('/board')
    expect(container.querySelector('.shell-timer-probe')).toBeNull()
    expect(calls.mounts).toBe(0)
  })

  it('not on the receipt screens (chromeless): the pill would sit over their sticky Save bar', () => {
    calls.mounts = 0
    const { container } = at('/scan/receipt')
    expect(container.querySelector('.shell-timer-probe')).toBeNull()
    expect(calls.mounts).toBe(0)
  })

  it('entering Cook Mode from a framed page unmounts it (its alarm stops, Cook Mode rings its own)', async () => {
    const { router, container } = at('/plan')
    expect(container.querySelector('.shell-timer-probe')).not.toBeNull()
    await router.navigate('/cook/recipe/12')
    expect(container.querySelector('.shell-timer-probe')).toBeNull()
  })
})
