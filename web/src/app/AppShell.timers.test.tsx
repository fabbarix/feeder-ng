// B9-25 (PC-04): where the shell mounts the timer pill. In the framed pages (every route except Cook Mode, the board and the receipt
// screens, which are chromeless) ShellTimers is a direct child of .app-shell, after the top bar, outside <main>, mounted once so it
// survives navigation. In the chromeless frame it is not mounted at all, so the hook does not poll or ring there (Cook Mode runs its
// own timers and alarm; the board shows its own).
import { act, render } from '@testing-library/react'
import { createElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ mounts: 0, alerts: 0 }))
vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))
vi.mock('./ShellTimers', () => ({
  ShellTimers: () => {
    calls.mounts += 1
    return <div data-testid="shell-timers" className="shell-timer-probe" />
  },
  ShellTimerAlert: () => {
    calls.alerts += 1
    return <div data-testid="shell-timer-alert" className="shell-timer-alert-probe" />
  },
}))

import { AppShell } from './AppShell'

function at(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppShell user={{ displayName: 'Anna Rossi' }} onSignOut={() => {}} />,
        children: ['plan', 'pantry', 'board', 'cook/recipe/12', 'scan/receipt', 'scan/receipt/7'].map((p) => ({ path: p, element: createElement('h1', null, p) })),
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
    await act(() => router.navigate('/pantry'))
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
    await act(() => router.navigate('/cook/recipe/12'))
    expect(container.querySelector('.shell-timer-probe')).toBeNull()
  })
})

// Main-session ruling 1 (B9-25): the pill stays off the chromeless screens, but the finish BANNER also shows on the receipt screens,
// where a cook can be when a timer ends. ShellTimerAlert (banner and Timers sheet, no pill) is mounted there, in place of ShellTimers,
// so there is still one poll and one alarm. Cook Mode and the board show timers themselves: neither is mounted there.
describe('AppShell mounts the finish banner on the receipt screens (PC-04, ruling 1)', () => {
  it('on /scan/receipt and below: one ShellTimerAlert, a child of the chromeless .app-shell, and no ShellTimers', () => {
    for (const path of ['/scan/receipt', '/scan/receipt/7']) {
      calls.mounts = 0
      const { container, unmount } = at(path)
      const alerts = container.querySelectorAll('.shell-timer-alert-probe')
      expect(alerts, path).toHaveLength(1)
      expect(alerts[0]!.parentElement).toBe(container.querySelector('.app-shell--chromeless'))
      expect(container.querySelector('main')!.contains(alerts[0]!)).toBe(false)
      expect(calls.mounts, path).toBe(0)
      unmount()
    }
  })

  it('not in the framed pages (ShellTimers carries the banner there), not in Cook Mode, not on the board', () => {
    for (const path of ['/plan', '/cook/recipe/12', '/board']) {
      calls.alerts = 0
      const { container, unmount } = at(path)
      expect(container.querySelector('.shell-timer-alert-probe'), path).toBeNull()
      expect(calls.alerts, path).toBe(0)
      unmount()
    }
  })

  it('going from a framed page to a receipt screen swaps ShellTimers for ShellTimerAlert (never both at once)', async () => {
    const { router, container } = at('/plan')
    expect(container.querySelector('.shell-timer-probe')).not.toBeNull()
    await act(() => router.navigate('/scan/receipt'))
    expect(container.querySelector('.shell-timer-probe')).toBeNull()
    expect(container.querySelectorAll('.shell-timer-alert-probe')).toHaveLength(1)
  })
})
