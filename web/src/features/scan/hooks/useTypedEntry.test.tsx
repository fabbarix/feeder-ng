// B9-35 (SSP-06, SSP-12): useTypedEntry owns whether the typed entry is open and where focus goes. New hook, pinned here.
//   useTypedEntry({ recovery, cameraWorks, blocked }) -> { open, toggle, entryRef, id, toggleDisabled }
//   - camera works: the entry is closed until "Type a barcode" (toggle) opens it (recovery.manualOpen is the state: openManual/closeManual);
//     opening focuses the Barcode field; toggling again closes it and returns focus to the toggle (`toggleRef`).
//   - no camera: the entry is open from the start (nothing to press) and is never focused on mount, so no keyboard pops up unasked.
//   - blocked (the Price keypad is open): the entry is closed whatever the camera does, `toggleDisabled` is true, and a manual entry
//     that was open is closed through recovery.closeManual. After the keypad closes the entry is closed again (camera works) or open
//     again (no camera); it does not reopen by itself.
//   `entryRef` and `toggleRef` are attached by the screen to the <form data-typed-entry> and to the Type a barcode button.
import { act, render, renderHook, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CameraRecovery } from './useCameraRecovery'
import { useTypedEntry } from './useTypedEntry'

function makeRecovery(over: Partial<CameraRecovery> = {}): CameraRecovery {
  return { failure: null, manualOpen: false, openManual: vi.fn(), closeManual: vi.fn(), text: '', setText: vi.fn(), error: null, submit: vi.fn(() => true), retry: vi.fn(), ...over }
}

describe('useTypedEntry: pure state', () => {
  it('camera works: closed by default; open follows recovery.manualOpen', () => {
    const r = makeRecovery()
    const { result, rerender } = renderHook((p: { recovery: CameraRecovery }) => useTypedEntry({ recovery: p.recovery, cameraWorks: true, blocked: false }), { initialProps: { recovery: r } })
    expect(result.current.open).toBe(false)
    rerender({ recovery: makeRecovery({ manualOpen: true }) })
    expect(result.current.open).toBe(true)
  })

  it('camera works: toggle opens a closed entry and closes an open one, through the recovery', () => {
    const closed = makeRecovery()
    const a = renderHook(() => useTypedEntry({ recovery: closed, cameraWorks: true, blocked: false }))
    act(() => a.result.current.toggle())
    expect(closed.openManual).toHaveBeenCalledTimes(1)
    const open = makeRecovery({ manualOpen: true })
    const b = renderHook(() => useTypedEntry({ recovery: open, cameraWorks: true, blocked: false }))
    act(() => b.result.current.toggle())
    expect(open.closeManual).toHaveBeenCalledTimes(1)
  })

  it('no camera: open without being asked, whatever recovery.manualOpen says', () => {
    const { result } = renderHook(() => useTypedEntry({ recovery: makeRecovery({ manualOpen: false }), cameraWorks: false, blocked: false }))
    expect(result.current.open).toBe(true)
    expect(result.current.toggleDisabled).toBe(false)
  })

  it('blocked by the Price keypad: closed in both cases, and the toggle is disabled', () => {
    for (const cameraWorks of [true, false]) {
      const { result } = renderHook(() => useTypedEntry({ recovery: makeRecovery({ manualOpen: true }), cameraWorks, blocked: true }))
      expect(result.current.open).toBe(false)
      expect(result.current.toggleDisabled).toBe(true)
    }
  })

  it('an entry that was open when the keypad opened is closed through the recovery (camera works), once', () => {
    const r = makeRecovery({ manualOpen: true })
    const { rerender } = renderHook((p: { blocked: boolean }) => useTypedEntry({ recovery: r, cameraWorks: true, blocked: p.blocked }), { initialProps: { blocked: false } })
    expect(r.closeManual).not.toHaveBeenCalled()
    rerender({ blocked: true })
    expect(r.closeManual).toHaveBeenCalledTimes(1)
    rerender({ blocked: true })
    expect(r.closeManual).toHaveBeenCalledTimes(1)
  })

  it('the toggle does nothing while blocked', () => {
    const r = makeRecovery()
    const { result } = renderHook(() => useTypedEntry({ recovery: r, cameraWorks: true, blocked: true }))
    act(() => result.current.toggle())
    expect(r.openManual).not.toHaveBeenCalled()
  })

  it('gives the entry an id that is stable and unique to the instance (aria-controls)', () => {
    const a = renderHook(() => useTypedEntry({ recovery: makeRecovery(), cameraWorks: true, blocked: false }))
    const b = renderHook(() => useTypedEntry({ recovery: makeRecovery(), cameraWorks: true, blocked: false }))
    expect(a.result.current.id).toBeTruthy()
    expect(a.result.current.id).not.toBe(b.result.current.id)
  })
})

/** The hook with a real form and toggle button, and a recovery whose manualOpen is real state. */
function Harness({ cameraWorks, blocked = false }: { cameraWorks: boolean; blocked?: boolean }) {
  const [manualOpen, setManualOpen] = useState(false)
  const recovery = makeRecovery({ manualOpen, openManual: () => setManualOpen(true), closeManual: () => setManualOpen(false) })
  const entry = useTypedEntry({ recovery, cameraWorks, blocked })
  return (
    <div>
      <button ref={entry.toggleRef} onClick={entry.toggle} disabled={entry.toggleDisabled} aria-expanded={entry.open} aria-controls={entry.id}>
        Type a barcode
      </button>
      <button>elsewhere</button>
      {entry.open ? (
        <form ref={entry.entryRef} id={entry.id} data-typed-entry>
          <input aria-label="Barcode" />
        </form>
      ) : null}
    </div>
  )
}

describe('useTypedEntry: focus', () => {
  it('opening with the toggle focuses the Barcode field', () => {
    render(<Harness cameraWorks />)
    act(() => screen.getByRole('button', { name: 'Type a barcode' }).click())
    expect(screen.getByRole('textbox', { name: 'Barcode' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Type a barcode' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('closing with the toggle returns focus to the toggle', () => {
    render(<Harness cameraWorks />)
    const toggle = screen.getByRole('button', { name: 'Type a barcode' })
    act(() => toggle.click())
    act(() => toggle.click())
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(toggle).toHaveFocus()
  })

  it('no camera: the entry is there at once and is not focused on mount', () => {
    render(<Harness cameraWorks={false} />)
    expect(screen.getByRole('textbox', { name: 'Barcode' })).not.toHaveFocus()
  })

  it('no camera: the entry comes back when the keypad closes, without taking focus', () => {
    const { rerender } = render(<Harness cameraWorks={false} blocked />)
    expect(screen.queryByRole('textbox')).toBeNull()
    rerender(<Harness cameraWorks={false} blocked={false} />)
    expect(screen.getByRole('textbox', { name: 'Barcode' })).not.toHaveFocus()
  })

  it('camera works: after the keypad closes the entry stays closed (it does not reopen by itself)', () => {
    const { rerender } = render(<Harness cameraWorks />)
    act(() => screen.getByRole('button', { name: 'Type a barcode' }).click())
    rerender(<Harness cameraWorks blocked />)
    expect(screen.queryByRole('textbox')).toBeNull()
    rerender(<Harness cameraWorks blocked={false} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Type a barcode' })).toHaveAttribute('aria-expanded', 'false')
  })
})
