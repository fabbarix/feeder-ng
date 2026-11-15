// B9-25 (PC-04): the shell's timer pill, the in-app finish alert and the Timers sheet. The hook (useHouseholdTimers) is replaced by a
// settable value; its own tests are in hooks/useHouseholdTimers.test.tsx. The shared primitive (ui/TimerPill) is covered by TimerPill.test.tsx.
//   Pill: shows whenever a timer exists (its soonest, "+N" for the others); a tap opens Cook Mode at that timer's Step (resume), or the
//         Timers sheet when the timers belong to several scopes or to none.
//   Banner: role alert, does not move focus, never native; Open Cook Mode (primary) and Dismiss (secondary); Esc dismisses it.
// Chapter scenarios: "Tapping the timer pill reopens Cook Mode at the Step I left", "A timer finishing on another screen alerts me in
// the app" (the banner here; the server half is bdd/features/cook-board/timers_shell.feature).
// The ToastProvider mounts empty live regions, so alerts are looked up inside the banner's own element, never as an unscoped role.
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShellTimer } from '../features/cook/lib/householdTimers'
import type { HouseholdTimers } from './hooks/useHouseholdTimers'

const state = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('./hooks/useHouseholdTimers', () => ({ useHouseholdTimers: () => state.value }))

import { ShellTimers } from './ShellTimers'

const tm = (over: Partial<ShellTimer> = {}): ShellTimer => ({
  id: 1, scope: 'recipe:12', step: 2, recipeName: 'Roast chicken with rice and a sauce', title: 'Roast the chicken', stepNumber: 3, seconds: 1122, state: 'running', ...over,
})
const hh = (over: Partial<HouseholdTimers> = {}): HouseholdTimers => {
  const all = over.all ?? (over.head ? [over.head] : [])
  const finished = over.finished ?? all.filter((t) => t.state === 'finished')
  return { head: over.head ?? all[0] ?? null, more: Math.max(0, all.length - 1), nameSeconds: all[0]?.seconds ?? 0, all, finished, ringing: finished.length > 0, dismissFinished: vi.fn(async () => {}), ...over }
}
const set = (v: HouseholdTimers) => {
  state.value = v
  return v
}

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}
function mount(path = '/plan') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ShellTimers />
      <Where />
    </MemoryRouter>,
  )
}
const where = () => screen.getByTestId('where').textContent
const banner = (c: HTMLElement) => c.querySelector<HTMLElement>('.shell-timer-banner')
const pillBtn = () => screen.getByRole('button', { name: /^Timer/ })

beforeEach(() => {
  set(hh())
  window.localStorage.clear()
})

describe('the pill', () => {
  it('no timers: nothing is rendered (no pill, no banner, no sheet)', () => {
    const { container } = mount()
    expect(container.querySelector('.shell-timer')).toBeNull()
    expect(banner(container)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Timer/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a running timer shows one pill named "Timer: <title>, <m:ss>. Open Cook Mode"', () => {
    set(hh({ head: tm(), nameSeconds: 1122 }))
    const { container } = mount()
    expect(container.querySelectorAll('.shell-timer')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Timer: Roast the chicken, 18:42. Open Cook Mode' })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Roast the chicken' })).toBeInTheDocument()
    expect(container.querySelector('.shell-timer .timer-pill__time')).toHaveTextContent('18:42')
  })

  it('the visible time follows the countdown while the accessible name follows nameSeconds (once a minute)', () => {
    set(hh({ head: tm({ seconds: 1112 }), nameSeconds: 1122 }))
    const { container } = mount()
    expect(container.querySelector('.timer-pill__time')).toHaveTextContent('18:32')
    expect(screen.getByRole('button', { name: 'Timer: Roast the chicken, 18:42. Open Cook Mode' })).toBeInTheDocument()
  })

  it('more timers: a "+N" badge, and the count is in the name ("and 2 more")', () => {
    const others = [tm({ id: 2, title: 'Rest', scope: 'recipe:12' }), tm({ id: 3, title: 'Eggs', scope: null, step: null })]
    set(hh({ all: [tm(), ...others] }))
    const { container } = mount()
    expect(container.querySelector('.timer-pill__more')).toHaveTextContent('+2')
    expect(pillBtn()).toHaveAccessibleName('Timer: Roast the chicken, 18:42, and 2 more. Open Cook Mode')
  })

  it('a paused head shows the paused state', () => {
    set(hh({ head: tm({ state: 'paused' }) }))
    const { container } = mount()
    expect(container.querySelector('.timer-pill')).toHaveAttribute('data-state', 'paused')
  })

  it('a finished head shows the finished state: "Timer finished: <title>. Open Cook Mode" and the word "finished"', () => {
    set(hh({ all: [tm({ state: 'finished', seconds: 0 })] }))
    const { container } = mount()
    expect(container.querySelector('.timer-pill')).toHaveAttribute('data-state', 'finished')
    expect(screen.getByRole('button', { name: 'Timer finished: Roast the chicken. Open Cook Mode' })).toBeInTheDocument()
    expect(container.querySelector('.shell-timer .timer-pill__time')).toHaveTextContent('finished')
  })

  it('the shell\'s pill has no Pause control (Cook Mode\'s strip has)', () => {
    set(hh({ head: tm() }))
    mount()
    expect(screen.queryByRole('button', { name: /^Pause/ })).toBeNull()
  })

  it('the pill wrapper carries the head\'s state for the CSS (data-state on .shell-timer)', () => {
    set(hh({ all: [tm({ state: 'finished', seconds: 0 })] }))
    const { container } = mount()
    expect(container.querySelector('.shell-timer')).toHaveAttribute('data-state', 'finished')
  })
})

describe('Tapping the timer pill reopens Cook Mode at the Step I left', () => {
  it('a Recipe timer: goes to /cook/recipe/<id> and leaves that Step as the resume Step', async () => {
    set(hh({ head: tm({ scope: 'recipe:12', step: 2 }) }))
    mount('/plan')
    await userEvent.click(pillBtn())
    expect(where()).toBe('/cook/recipe/12')
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2')
  })

  it('a Planned Meal Course timer: goes to /cook/meal/<date>/<slot>/<course>', async () => {
    set(hh({ head: tm({ scope: 'meal:2026-11-09/3/1', step: 4 }) }))
    mount('/')
    await userEvent.click(pillBtn())
    expect(where()).toBe('/cook/meal/2026-11-09/3/1')
    expect(window.localStorage.getItem('feeder.cook.resume.meal:2026-11-09/3/1')).toBe('4')
  })

  it('a finished timer opens on the NEXT Step ("<step>+")', async () => {
    set(hh({ all: [tm({ state: 'finished', seconds: 0, step: 2 })] }))
    mount()
    await userEvent.click(pillBtn())
    expect(where()).toBe('/cook/recipe/12')
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2+')
  })

  it('the timers of one scope (several Steps) still go straight to that Cook Mode, on the head\'s Step', async () => {
    set(hh({ all: [tm({ id: 1, step: 2 }), tm({ id: 2, step: 4, title: 'Rest' })] }))
    mount()
    await userEvent.click(pillBtn())
    expect(where()).toBe('/cook/recipe/12')
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2')
  })

  it('a blocked storage does not stop the tap: Cook Mode still opens', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      set(hh({ head: tm() }))
      mount()
      await userEvent.click(pillBtn())
      expect(where()).toBe('/cook/recipe/12')
    } finally {
      setItem.mockRestore()
    }
  })
})

describe('the Timers sheet: several scopes, or a free timer', () => {
  const several = () =>
    set(hh({ all: [tm({ id: 1 }), tm({ id: 2, scope: 'meal:2026-11-09/3/1', step: 4, title: 'Simmer the sauce', seconds: 900 }), tm({ id: 3, scope: null, step: null, title: 'Eggs', recipeName: '', stepNumber: null, seconds: 120 })] }))

  it('the timers of several scopes open a sheet titled "Timers" instead of navigating', async () => {
    several()
    mount('/plan')
    await userEvent.click(pillBtn())
    expect(screen.getByRole('dialog', { name: /Timers/ })).toBeInTheDocument()
    expect(where()).toBe('/plan')
  })

  it('it lists every timer: title, time, and for a Recipe timer its Recipe and Step', async () => {
    several()
    mount()
    await userEvent.click(pillBtn())
    const sheet = screen.getByRole('dialog', { name: /Timers/ })
    const rows = within(sheet).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Roast the chicken')
    expect(rows[0]).toHaveTextContent('18:42')
    expect(rows[0]).toHaveTextContent('Roast chicken with rice and a sauce · Step 3')
    expect(rows[1]).toHaveTextContent('Simmer the sauce')
    expect(rows[1]).toHaveTextContent('15:00')
    expect(rows[2]).toHaveTextContent('Eggs')
    expect(rows[2]).toHaveTextContent('2:00')
  })

  it('a row with a Cook Mode has a button "Open Cook Mode: <title>" (distinct names); a free timer has none', async () => {
    several()
    mount()
    await userEvent.click(pillBtn())
    const sheet = screen.getByRole('dialog', { name: /Timers/ })
    expect(within(sheet).getByRole('button', { name: 'Open Cook Mode: Roast the chicken' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Open Cook Mode: Simmer the sauce' })).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: /Eggs/ })).toBeNull()
  })

  it('opening a row goes to that timer\'s Cook Mode on its Step, and closes the sheet', async () => {
    several()
    mount('/plan')
    await userEvent.click(pillBtn())
    await userEvent.click(within(screen.getByRole('dialog', { name: /Timers/ })).getByRole('button', { name: 'Open Cook Mode: Simmer the sauce' }))
    expect(where()).toBe('/cook/meal/2026-11-09/3/1')
    expect(window.localStorage.getItem('feeder.cook.resume.meal:2026-11-09/3/1')).toBe('4')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a finished row opens on the next Step', async () => {
    set(hh({ all: [tm({ id: 1, state: 'finished', seconds: 0 }), tm({ id: 2, scope: 'recipe:13', step: 1, title: 'Boil', seconds: 100 })] }))
    mount()
    await userEvent.click(pillBtn())
    await userEvent.click(within(screen.getByRole('dialog', { name: /Timers/ })).getByRole('button', { name: 'Open Cook Mode: Roast the chicken' }))
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2+')
  })

  it('a lone free timer has no Cook Mode: the tap opens the sheet', async () => {
    set(hh({ all: [tm({ scope: null, step: null, title: 'Eggs', recipeName: '', stepNumber: null, seconds: 120 })] }))
    mount()
    await userEvent.click(pillBtn())
    expect(screen.getByRole('dialog', { name: /Timers/ })).toBeInTheDocument()
    expect(where()).toBe('/plan')
  })

  it('the sheet is a Close-button sheet (no Cancel), and Escape closes it', async () => {
    several()
    mount()
    await userEvent.click(pillBtn())
    const sheet = screen.getByRole('dialog', { name: /Timers/ })
    expect(within(sheet).queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(within(sheet).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('A timer finishing on another screen alerts me in the app: the banner', () => {
  const finishedOne = (over: Partial<ShellTimer> = {}) => tm({ state: 'finished', seconds: 0, recipeName: 'Review roast chicken with rice and a sauce', ...over })

  it('no finished timer, no banner (a running one does not alert)', () => {
    set(hh({ head: tm() }))
    const { container } = mount()
    expect(banner(container)).toBeNull()
  })

  it('a finished timer shows ONE banner, role alert: headline, subline, Open Cook Mode and Dismiss', () => {
    set(hh({ all: [finishedOne()] }))
    const { container } = mount()
    const b = banner(container)!
    expect(b).not.toBeNull()
    expect(b).toHaveAttribute('role', 'alert')
    expect(within(b).getByText('Timer finished: Roast the chicken')).toBeInTheDocument()
    expect(within(b).getByText('Review roast chicken with rice and a sauce · Step 3')).toBeInTheDocument()
    expect(within(b).getByRole('button', { name: 'Open Cook Mode' })).toBeInTheDocument()
    expect(within(b).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(container.querySelectorAll('.shell-timer-banner')).toHaveLength(1)
  })

  it('Open Cook Mode is the primary button and Dismiss is a SECONDARY button (outlined on the tinted banner, R-A)', () => {
    set(hh({ all: [finishedOne()] }))
    const { container } = mount()
    const b = banner(container)!
    expect(within(b).getByRole('button', { name: 'Open Cook Mode' })).toHaveAttribute('data-variant', 'primary')
    expect(within(b).getByRole('button', { name: 'Dismiss' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('several finished timers share one banner: "2 timers finished" with the titles', () => {
    set(hh({ all: [finishedOne(), finishedOne({ id: 2, title: 'Simmer the sauce', stepNumber: 2 })] }))
    const { container } = mount()
    expect(container.querySelectorAll('.shell-timer-banner')).toHaveLength(1)
    const b = banner(container)!
    expect(within(b).getByText('2 timers finished')).toBeInTheDocument()
    expect(within(b).getByText('Roast the chicken, Simmer the sauce')).toBeInTheDocument()
  })

  it('Open Cook Mode goes to the finished timer\'s Cook Mode on the NEXT Step', async () => {
    set(hh({ all: [finishedOne()] }))
    const { container } = mount('/plan')
    await userEvent.click(within(banner(container)!).getByRole('button', { name: 'Open Cook Mode' }))
    expect(where()).toBe('/cook/recipe/12')
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2+')
  })

  it('Open Cook Mode with finished timers of several scopes opens the Timers sheet', async () => {
    set(hh({ all: [finishedOne(), finishedOne({ id: 2, scope: 'recipe:13', title: 'Boil' })] }))
    const { container } = mount('/plan')
    await userEvent.click(within(banner(container)!).getByRole('button', { name: 'Open Cook Mode' }))
    expect(screen.getByRole('dialog', { name: /Timers/ })).toBeInTheDocument()
    expect(where()).toBe('/plan')
  })

  it('Open Cook Mode on a finished free timer opens the Timers sheet (it has no Cook Mode)', async () => {
    set(hh({ all: [finishedOne({ scope: null, step: null, title: 'Eggs', recipeName: '', stepNumber: null })] }))
    const { container } = mount()
    await userEvent.click(within(banner(container)!).getByRole('button', { name: 'Open Cook Mode' }))
    expect(screen.getByRole('dialog', { name: /Timers/ })).toBeInTheDocument()
  })

  it('Dismiss dismisses the finished timers (the hook cancels them) and does not navigate', async () => {
    const v = set(hh({ all: [finishedOne()] }))
    const { container } = mount('/plan')
    await userEvent.click(within(banner(container)!).getByRole('button', { name: 'Dismiss' }))
    expect(v.dismissFinished).toHaveBeenCalledTimes(1)
    expect(where()).toBe('/plan')
  })

  it('Esc dismisses the banner', async () => {
    const v = set(hh({ all: [finishedOne()] }))
    mount()
    await userEvent.keyboard('{Escape}')
    expect(v.dismissFinished).toHaveBeenCalledTimes(1)
  })

  it('Esc with no banner does nothing', async () => {
    const v = set(hh({ head: tm() }))
    mount()
    await userEvent.keyboard('{Escape}')
    expect(v.dismissFinished).not.toHaveBeenCalled()
  })

  it('the banner does not move focus: a field the cook is typing in keeps it when the timer finishes', () => {
    set(hh({ head: tm() }))
    const view = render(
      <MemoryRouter>
        <input aria-label="Servings" />
        <ShellTimers />
      </MemoryRouter>,
    )
    const field = screen.getByLabelText('Servings')
    field.focus()
    expect(document.activeElement).toBe(field)
    set(hh({ all: [finishedOne()] }))
    act(() => {
      view.rerender(
        <MemoryRouter>
          <input aria-label="Servings" />
          <ShellTimers />
        </MemoryRouter>,
      )
    })
    expect(banner(view.container)).not.toBeNull()
    expect(document.activeElement).toBe(field)
  })

  it('never native: no alert, confirm or Notification permission request', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const confirm = vi.spyOn(window, 'confirm').mockImplementation(() => true)
    const request = vi.fn()
    vi.stubGlobal('Notification', Object.assign(function Notification() {}, { permission: 'default', requestPermission: request }))
    try {
      set(hh({ all: [finishedOne()] }))
      mount()
      expect(alert).not.toHaveBeenCalled()
      expect(confirm).not.toHaveBeenCalled()
      expect(request).not.toHaveBeenCalled()
    } finally {
      alert.mockRestore()
      confirm.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('the banner stays while the finished timer exists (nothing hides it by itself), and goes when the list is empty', () => {
    set(hh({ all: [finishedOne()] }))
    const view = mount()
    expect(banner(view.container)).not.toBeNull()
    set(hh())
    view.rerender(
      <MemoryRouter initialEntries={['/plan']}>
        <ShellTimers />
        <Where />
      </MemoryRouter>,
    )
    expect(banner(view.container)).toBeNull()
  })
})

// Main-session ruling 3 (B9-25): a Recipe cook's Batches are kept with the resume Step, so the pill reopens the same Batches.
describe('the pill reopens a Recipe cook with the same Batches (ruling 3)', () => {
  function WhereFull() {
    const { pathname, search } = useLocation()
    return <p data-testid="where-full">{pathname + search}</p>
  }
  const mountFull = () =>
    render(
      <MemoryRouter initialEntries={['/plan']}>
        <ShellTimers />
        <WhereFull />
      </MemoryRouter>,
    )

  it('Cook Mode was opened with 2 Batches: the tap goes to /cook/recipe/<id>?batches=2 and keeps them stored', async () => {
    window.localStorage.setItem('feeder.cook.resume.recipe:12', '1@2')
    set(hh({ head: tm({ scope: 'recipe:12', step: 2 }) }))
    mountFull()
    await userEvent.click(pillBtn())
    expect(screen.getByTestId('where-full').textContent).toBe('/cook/recipe/12?batches=2')
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2@2')
  })

  it('a finished timer with Batches stored: the next Step and the same Batches ("2+@2")', async () => {
    window.localStorage.setItem('feeder.cook.resume.recipe:12', '2@2')
    set(hh({ all: [tm({ state: 'finished', seconds: 0, step: 2 })] }))
    mountFull()
    await userEvent.click(pillBtn())
    expect(screen.getByTestId('where-full').textContent).toBe('/cook/recipe/12?batches=2')
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2+@2')
  })

  it('an old stored value without Batches opens with 1 Batch (the plain path)', async () => {
    window.localStorage.setItem('feeder.cook.resume.recipe:12', '3')
    set(hh({ head: tm({ scope: 'recipe:12', step: 2 }) }))
    mountFull()
    await userEvent.click(pillBtn())
    expect(screen.getByTestId('where-full').textContent).toBe('/cook/recipe/12')
  })
})

// Main-session ruling 7 (B9-25): the banner's bell is the status, so it sits on the headline line, never as a separate success icon.
describe('the banner\'s icon (ruling 7)', () => {
  it('the bell is inside the headline line, beside the headline text; no other icon in the banner outside its buttons', () => {
    set(hh({ all: [tm({ state: 'finished', seconds: 0 })] }))
    const { container } = mount()
    const b = banner(container)!
    const icons = [...b.querySelectorAll('svg')].filter((svg) => !svg.closest('button'))
    expect(icons).toHaveLength(1)
    const line = icons[0]!.parentElement!
    expect(line).toBe(b.querySelector('.shell-timer-banner__title')!.parentElement)
  })
})

// Main-session ruling 1 (B9-25): on the receipt screens (chromeless: no pill) the finish banner still shows. AppShell mounts the
// same keyed ShellTimers there with pill={false} (AppShell.timers.test.tsx), so there is one poll and one alarm across both frames.
describe('ShellTimers pill={false}: the receipt screens\' finish banner (ruling 1)', () => {
  const mountAlert = (path = '/scan/receipt') =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <ShellTimers pill={false} />
        <Where />
      </MemoryRouter>,
    )

  it('a running timer: nothing at all (no pill on the receipt screens)', () => {
    set(hh({ head: tm() }))
    const { container } = mountAlert()
    expect(container.querySelector('.shell-timer')).toBeNull()
    expect(banner(container)).toBeNull()
    expect(screen.queryByRole('button', { name: /^Timer/ })).toBeNull()
  })

  it('a finished timer: the banner, role alert, with Open Cook Mode and Dismiss, and still no pill', () => {
    set(hh({ all: [tm({ state: 'finished', seconds: 0 })] }))
    const { container } = mountAlert()
    const b = banner(container)!
    expect(b).toHaveAttribute('role', 'alert')
    expect(within(b).getByRole('button', { name: 'Open Cook Mode' })).toHaveAttribute('data-variant', 'primary')
    expect(within(b).getByRole('button', { name: 'Dismiss' })).toHaveAttribute('data-variant', 'secondary')
    expect(container.querySelector('.shell-timer')).toBeNull()
  })

  it('Open Cook Mode goes to the finished timer\'s Cook Mode on the next Step', async () => {
    set(hh({ all: [tm({ state: 'finished', seconds: 0 })] }))
    const { container } = mountAlert()
    await userEvent.click(within(banner(container)!).getByRole('button', { name: 'Open Cook Mode' }))
    expect(where()).toBe('/cook/recipe/12')
    expect(window.localStorage.getItem('feeder.cook.resume.recipe:12')).toBe('2+')
  })

  it('Dismiss and Esc dismiss it through the hook', async () => {
    const v = set(hh({ all: [tm({ state: 'finished', seconds: 0 })] }))
    const { container } = mountAlert()
    await userEvent.click(within(banner(container)!).getByRole('button', { name: 'Dismiss' }))
    await userEvent.keyboard('{Escape}')
    expect(v.dismissFinished).toHaveBeenCalledTimes(2)
  })

  it('finished timers of several scopes: Open Cook Mode opens the Timers sheet', async () => {
    set(hh({ all: [tm({ state: 'finished', seconds: 0 }), tm({ id: 2, state: 'finished', seconds: 0, scope: 'recipe:13', title: 'Boil' })] }))
    const { container } = mountAlert()
    await userEvent.click(within(banner(container)!).getByRole('button', { name: 'Open Cook Mode' }))
    expect(screen.getByRole('dialog', { name: /Timers/ })).toBeInTheDocument()
    expect(where()).toBe('/scan/receipt')
  })
})
