// B9-49 (RES-07): "Back online: the banner disappears. If anything was waiting, a status toast says 'Back online · 3 changes synced'.
// The noun follows the queue: '2 Scans and 1 Tick synced'" (the res-03 mock reads "Back online · 1 Tick synced", no icon: a plain
// success is not a status, R-D+). The hook watches offline and the queue counts the shell already has:
//   it remembers the most that waited while offline (or while the queue drained after coming back), and speaks once the queue is empty
//   again after the connection returned. Nothing waited: no toast. Going offline again before it drained: no toast yet.
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToastContent, ToastOptions } from '../ui/Toast'
import { useBackOnlineNotice, type BackOnlineInput } from './useBackOnlineNotice'

const show = vi.fn<(arg: string | ToastContent, options?: ToastOptions) => unknown>()
vi.mock('../ui/Toast', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ui/Toast')>()), useToast: () => ({ show, hold: () => () => {} }) }))

beforeEach(() => show.mockReset())

const title = () => {
  const [arg] = show.mock.calls.at(-1)!
  return typeof arg === 'string' ? arg : String(arg.title)
}
const status = () => {
  const [arg, options] = show.mock.calls.at(-1)!
  return typeof arg === 'string' ? options?.status : arg.status
}
const mount = (input: BackOnlineInput) => renderHook((p: BackOnlineInput) => useBackOnlineNotice(p), { initialProps: input })

describe('useBackOnlineNotice', () => {
  it('says nothing while online, and nothing when the connection returns with an empty queue', () => {
    const h = mount({ offline: false, pendingScans: 0, pendingTicks: 0 })
    h.rerender({ offline: true, pendingScans: 0, pendingTicks: 0 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 0 })
    expect(show).not.toHaveBeenCalled()
  })

  it('one Tick waited and synced: "Back online · 1 Tick synced"', () => {
    const h = mount({ offline: false, pendingScans: 0, pendingTicks: 0 })
    h.rerender({ offline: true, pendingScans: 0, pendingTicks: 1 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 1 }) // back, still syncing: not yet
    expect(show).not.toHaveBeenCalled()
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 0 })
    expect(show).toHaveBeenCalledTimes(1)
    expect(title()).toBe('Back online · 1 Tick synced')
  })

  it('the noun follows the queue: "2 Scans and 1 Tick synced"', () => {
    const h = mount({ offline: true, pendingScans: 2, pendingTicks: 1 })
    h.rerender({ offline: false, pendingScans: 2, pendingTicks: 1 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 0 })
    expect(title()).toBe('Back online · 2 Scans and 1 Tick synced')
  })

  it('counts the most that waited, not the last partial count while it drained', () => {
    const h = mount({ offline: true, pendingScans: 3, pendingTicks: 0 })
    h.rerender({ offline: false, pendingScans: 3, pendingTicks: 0 })
    h.rerender({ offline: false, pendingScans: 1, pendingTicks: 0 })
    expect(show).not.toHaveBeenCalled()
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 0 })
    expect(title()).toBe('Back online · 3 Scans synced')
  })

  it('is a plain line with no success icon (status neutral or none), never an error or a warning', () => {
    const h = mount({ offline: true, pendingScans: 0, pendingTicks: 2 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 0 })
    expect([undefined, 'neutral']).toContain(status())
  })

  it('going offline again before the queue drained keeps waiting: one toast, after the next return', () => {
    const h = mount({ offline: true, pendingScans: 0, pendingTicks: 2 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 2 })
    h.rerender({ offline: true, pendingScans: 0, pendingTicks: 2 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 2 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 0 })
    expect(show).toHaveBeenCalledTimes(1)
    expect(title()).toBe('Back online · 2 Ticks synced')
  })

  it('speaks once per return (a second offline spell with an empty queue says nothing)', () => {
    const h = mount({ offline: true, pendingScans: 1, pendingTicks: 0 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 0 })
    h.rerender({ offline: true, pendingScans: 0, pendingTicks: 0 })
    h.rerender({ offline: false, pendingScans: 0, pendingTicks: 0 })
    expect(show).toHaveBeenCalledTimes(1)
  })
})
