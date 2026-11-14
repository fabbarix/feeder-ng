// B9-21 (RES-10): the "A new version of Feeder is ready" toast. The hook is tested against the toast API as it is on main
// (useToast().show with rich content); a last test renders the real ToastProvider.
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, type ToastContent } from '../ui/Toast'
import type { UpdateControls } from './serviceWorker'
import { useAppUpdate, type AppUpdateInputs } from './useAppUpdate'

const show = vi.fn<(arg: string | ToastContent, options?: unknown) => void>()
vi.mock('../ui/Toast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ui/Toast')>()
  return { ...actual, useToast: () => ({ show }) }
})

const TITLE = 'A new version of Feeder is ready'

function makeSource() {
  let listener: ((c: UpdateControls) => void) | null = null
  const controls: UpdateControls = { applyUpdate: vi.fn(), checkForUpdate: vi.fn(async () => {}) }
  return {
    controls,
    subscribe: (l: (c: UpdateControls) => void) => {
      listener = l
      return () => {
        listener = null
      }
    },
    announce: () => act(() => listener?.(controls)),
    subscribed: () => listener !== null,
  }
}

let navigate: ReturnType<typeof useNavigate>
function Host({ inputs }: { inputs: AppUpdateInputs }) {
  navigate = useNavigate()
  useAppUpdate(inputs)
  return null
}
function mount(inputs: AppUpdateInputs, path = '/shop') {
  const ui = (i: AppUpdateInputs): ReactNode => (
    <MemoryRouter initialEntries={[path]}>
      <Host inputs={i} />
    </MemoryRouter>
  )
  const view = render(ui(inputs))
  return { ...view, rerender: (i: AppUpdateInputs) => view.rerender(ui(i)) }
}
const shown = () => show.mock.calls.map((c) => c[0] as ToastContent)

beforeEach(() => show.mockReset())

describe('the update toast', () => {
  it('shows nothing until an update is ready', () => {
    const src = makeSource()
    mount({ subscribe: src.subscribe })
    expect(show).not.toHaveBeenCalled()
  })

  it('A new version offers Reload and Later: an update ready shows an info toast: the headline alone, with Reload and Later, that stays until acted on', () => {
    const src = makeSource()
    mount({ subscribe: src.subscribe })
    src.announce()
    expect(show).toHaveBeenCalledTimes(1)
    const toast = shown()[0]!
    expect(typeof toast).toBe('object')
    expect(toast.status).toBe('info')
    expect(toast.title).toBe(TITLE)
    expect(toast.subline).toBeUndefined()
    expect(toast.body).toBeUndefined()
    expect(toast.actions?.map((a) => a.label)).toEqual(['Reload', 'Later'])
    // stays until acted on: an explicit duration wins over the 6 s default, and must fit setTimeout (2^31 - 1 ms)
    expect(toast.durationMs).toBeGreaterThanOrEqual(60 * 60 * 1000)
    expect(toast.durationMs).toBeLessThanOrEqual(2_147_483_647)
  })

  it('shows it once, however often the host re-renders or announces again', () => {
    const src = makeSource()
    const { rerender } = mount({ subscribe: src.subscribe })
    src.announce()
    rerender({ subscribe: src.subscribe, pendingSyncCount: 0 })
    rerender({ subscribe: src.subscribe, pendingSyncCount: 0, hasUnsavedChanges: false })
    src.announce()
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('Reload applies the update', () => {
    const src = makeSource()
    mount({ subscribe: src.subscribe })
    src.announce()
    shown()[0]!.actions![0]!.onClick()
    expect(src.controls.applyUpdate).toHaveBeenCalledTimes(1)
  })

  it('Later hides the prompt for this session: it does not come back on a navigation or a later announcement, and nothing is applied', () => {
    const src = makeSource()
    mount({ subscribe: src.subscribe })
    src.announce()
    shown()[0]!.actions![1]!.onClick()
    act(() => navigate('/plan'))
    act(() => navigate('/recipes'))
    src.announce()
    expect(show).toHaveBeenCalledTimes(1)
    expect(src.controls.applyUpdate).not.toHaveBeenCalled()
  })

  it('unsubscribes when the shell unmounts', () => {
    const src = makeSource()
    const { unmount } = mount({ subscribe: src.subscribe })
    expect(src.subscribed()).toBe(true)
    unmount()
    expect(src.subscribed()).toBe(false)
  })
})

describe('the prompt never interrupts: it waits, and shows on the next navigation once nothing holds it back', () => {
  it('while Scans or Ticks wait to sync it is held, and shows when the queue is empty', () => {
    const src = makeSource()
    const { rerender } = mount({ subscribe: src.subscribe, pendingSyncCount: 2 })
    src.announce()
    expect(show).not.toHaveBeenCalled()
    rerender({ subscribe: src.subscribe, pendingSyncCount: 1 })
    expect(show).not.toHaveBeenCalled()
    rerender({ subscribe: src.subscribe, pendingSyncCount: 0 })
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('while a form has unsaved changes it is held, and shows when they are saved or dropped', () => {
    const src = makeSource()
    const { rerender } = mount({ subscribe: src.subscribe, hasUnsavedChanges: true })
    src.announce()
    expect(show).not.toHaveBeenCalled()
    rerender({ subscribe: src.subscribe, hasUnsavedChanges: false })
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('"The update prompt waits during Cook Mode": held on /cook, shown on the next navigation off it', () => {
    const src = makeSource()
    mount({ subscribe: src.subscribe }, '/cook/12')
    src.announce()
    expect(show).not.toHaveBeenCalled()
    act(() => navigate('/'))
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('every chromeless screen holds it (the kitchen board, Cook Mode, the receipt screens); the shell screens do not', () => {
    for (const path of ['/board', '/cook/3', '/scan/receipt/review']) {
      show.mockReset()
      const src = makeSource()
      const { unmount } = mount({ subscribe: src.subscribe }, path)
      src.announce()
      expect(show, path).not.toHaveBeenCalled()
      unmount()
    }
    for (const path of ['/', '/plan', '/shop', '/scan', '/settings']) {
      show.mockReset()
      const src = makeSource()
      const { unmount } = mount({ subscribe: src.subscribe }, path)
      src.announce()
      expect(show, path).toHaveBeenCalledTimes(1)
      unmount()
    }
  })

  it('all holds count together: still held while one remains', () => {
    const src = makeSource()
    const { rerender } = mount({ subscribe: src.subscribe, pendingSyncCount: 1, hasUnsavedChanges: true }, '/cook/1')
    src.announce()
    rerender({ subscribe: src.subscribe, pendingSyncCount: 0, hasUnsavedChanges: true })
    expect(show).not.toHaveBeenCalled()
    rerender({ subscribe: src.subscribe, pendingSyncCount: 0, hasUnsavedChanges: false })
    expect(show).not.toHaveBeenCalled() // still on /cook
    act(() => navigate('/plan'))
    expect(show).toHaveBeenCalledTimes(1)
  })
})

describe('rendered with the real toast (as on main)', () => {
  it('renders the headline with no icon, Reload and Later as real buttons, and Reload applies the update', async () => {
    const actual = await vi.importActual<typeof import('../ui/Toast')>('../ui/Toast')
    show.mockImplementation(() => {})
    const src = makeSource()
    function Real() {
      const toast = actual.useToast()
      show.mockImplementation((arg, options) => toast.show(arg, options as never))
      useAppUpdate({ subscribe: src.subscribe })
      return null
    }
    render(
      <MemoryRouter>
        <ToastProvider>
          <Real />
        </ToastProvider>
      </MemoryRouter>,
    )
    src.announce()
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(TITLE)
    const toast = screen.getByText(TITLE).closest('[data-status]') as HTMLElement
    expect(toast).toHaveAttribute('data-status', 'info')
    expect(toast.querySelector('.toast__title svg')).toBeNull() // the headline already says it all
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(src.controls.applyUpdate).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(TITLE)).toBeNull()
  })

  it('Later closes the toast and applies nothing', async () => {
    const actual = await vi.importActual<typeof import('../ui/Toast')>('../ui/Toast')
    const src = makeSource()
    function Real() {
      const toast = actual.useToast()
      show.mockImplementation((arg, options) => toast.show(arg, options as never))
      useAppUpdate({ subscribe: src.subscribe })
      return null
    }
    render(
      <MemoryRouter>
        <ToastProvider>
          <Real />
        </ToastProvider>
      </MemoryRouter>,
    )
    src.announce()
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByText(TITLE)).toBeNull()
    expect(src.controls.applyUpdate).not.toHaveBeenCalled()
  })
})
