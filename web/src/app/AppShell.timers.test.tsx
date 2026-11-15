// B9-25 (PC-04): where the shell mounts the timer pill. In the framed pages (every route except Cook Mode, the board and the receipt
// screens, which are chromeless) ShellTimers is a direct child of .app-shell, after the top bar, outside <main>, mounted once so it
// survives navigation. In Cook Mode and on the board it is not mounted at all, so the hook does not poll or ring there (Cook Mode runs its
// own timers and alarm; the board shows its own).
import { act, render } from '@testing-library/react'
import { createElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({ mounts: 0, alerts: 0, effects: 0 }))
vi.mock('./ShellStatus', () => ({ ShellStatus: () => <div data-testid="shell-status" /> }))
vi.mock('./ShellTimers', async () => {
  const { useEffect } = await import('react')
  return {
    // One component for both frames: with the pill in the framed pages, pill={false} on the receipt screens. `effects` counts real
    // mounts (a remount would run the effect again); `mounts` / `alerts` count renders of each kind.
    ShellTimers: ({ pill = true }: { pill?: boolean }) => {
      useEffect(() => {
        calls.effects += 1
      }, [])
      if (pill) calls.mounts += 1
      else calls.alerts += 1
      return pill ? <div data-testid="shell-timers" className="shell-timer-probe" /> : <div data-testid="shell-timer-alert" className="shell-timer-alert-probe" />
    },
  }
})

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
// where a cook can be when a timer ends. The same keyed ShellTimers is mounted there with pill={false} (banner and Timers sheet, no
// pill), so moving between the frames keeps one mounted hook: one poll, one alarm, and a ringing timer keeps ringing (w4a).
// Cook Mode and the board show timers themselves: it is not mounted there.
describe('AppShell mounts the finish banner on the receipt screens (PC-04, ruling 1)', () => {
  it('on /scan/receipt and below: one ShellTimers without the pill, a child of the chromeless .app-shell', () => {
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

  it('the pill-less form is not used in the framed pages (the pill shows there), Cook Mode or the board', () => {
    for (const path of ['/plan', '/cook/recipe/12', '/board']) {
      calls.alerts = 0
      const { container, unmount } = at(path)
      expect(container.querySelector('.shell-timer-alert-probe'), path).toBeNull()
      expect(calls.alerts, path).toBe(0)
      unmount()
    }
  })

  it('going from a framed page to a receipt screen and back keeps the one mounted ShellTimers (no remount), pill off then on', async () => {
    calls.effects = 0
    const { router, container } = at('/plan')
    expect(container.querySelector('.shell-timer-probe')).not.toBeNull()
    expect(calls.effects).toBe(1)
    await act(() => router.navigate('/scan/receipt'))
    expect(container.querySelector('.shell-timer-probe')).toBeNull()
    expect(container.querySelectorAll('.shell-timer-alert-probe')).toHaveLength(1)
    await act(() => router.navigate('/plan'))
    expect(container.querySelectorAll('.shell-timer-probe')).toHaveLength(1)
    expect(calls.effects).toBe(1)
  })

  it('entering Cook Mode from a receipt screen unmounts it', async () => {
    const { router, container } = at('/scan/receipt')
    await act(() => router.navigate('/cook/recipe/12'))
    expect(container.querySelector('.shell-timer-alert-probe')).toBeNull()
    expect(container.querySelector('.shell-timer-probe')).toBeNull()
  })
})
