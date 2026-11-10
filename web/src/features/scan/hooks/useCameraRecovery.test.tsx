import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CameraStatus } from './useCamera'
import { useCameraRecovery } from './useCameraRecovery'

function setup(status: CameraStatus = 'denied') {
  const retryCamera = vi.fn()
  const onScan = vi.fn()
  const hook = renderHook(({ status }) => useCameraRecovery({ status, retryCamera, onScan }), { initialProps: { status } })
  return { retryCamera, onScan, hook }
}

describe('useCameraRecovery', () => {
  it('has no failure while the camera works', () => {
    for (const s of ['idle', 'starting', 'ready'] as const) {
      expect(setup(s).hook.result.current.failure).toBeNull()
    }
  })

  it('reports the failure with whether a retry can help', () => {
    expect(setup('denied').hook.result.current.failure).toMatchObject({ status: 'denied', canRetry: true })
    expect(setup('unsupported').hook.result.current.failure).toMatchObject({ status: 'unsupported', canRetry: false })
  })

  it('retry calls the camera retry and clears a manual-entry error', () => {
    const { hook, retryCamera } = setup('no_camera')
    act(() => hook.result.current.openManual())
    act(() => hook.result.current.setText('123'))
    act(() => void hook.result.current.submit())
    expect(hook.result.current.error).toBe('length')
    act(() => hook.result.current.retry())
    expect(retryCamera).toHaveBeenCalledTimes(1)
    expect(hook.result.current.error).toBeNull()
  })

  it('retry does nothing when the browser has no camera support', () => {
    const { hook, retryCamera } = setup('unsupported')
    act(() => hook.result.current.retry())
    expect(retryCamera).not.toHaveBeenCalled()
  })

  it('manual entry is closed until opened, and closing clears the text and the error', () => {
    const { hook } = setup()
    expect(hook.result.current.manualOpen).toBe(false)
    act(() => hook.result.current.openManual())
    expect(hook.result.current.manualOpen).toBe(true)
    act(() => hook.result.current.setText('abc'))
    act(() => void hook.result.current.submit())
    expect(hook.result.current.error).toBe('format')
    act(() => hook.result.current.closeManual())
    expect(hook.result.current).toMatchObject({ manualOpen: false, text: '', error: null })
  })

  it('manual entry closes, with its text and error cleared, when the camera recovers', () => {
    const { hook } = setup('denied')
    act(() => hook.result.current.openManual())
    act(() => hook.result.current.setText('123'))
    act(() => void hook.result.current.submit())
    expect(hook.result.current).toMatchObject({ manualOpen: true, error: 'length' })
    hook.rerender({ status: 'ready' })
    expect(hook.result.current).toMatchObject({ failure: null, manualOpen: false, text: '', error: null })
  })

  it('a valid typed barcode goes to onScan once, like a camera read, and clears the entry', () => {
    const { hook, onScan } = setup()
    act(() => hook.result.current.openManual())
    act(() => hook.result.current.setText(' 8000 5003 10427 '))
    let ok = false
    act(() => {
      ok = hook.result.current.submit()
    })
    expect(ok).toBe(true)
    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ kind: 'gtin', code: '08000500310427' }))
    expect(hook.result.current).toMatchObject({ text: '', error: null })
  })

  it('an invalid typed barcode is refused with its reason and not scanned', () => {
    const { hook, onScan } = setup()
    act(() => hook.result.current.openManual())
    act(() => hook.result.current.setText('8000500310428'))
    let ok = true
    act(() => {
      ok = hook.result.current.submit()
    })
    expect(ok).toBe(false)
    expect(hook.result.current.error).toBe('check_digit')
    expect(onScan).not.toHaveBeenCalled()
    act(() => hook.result.current.setText('8000500310427'))
    expect(hook.result.current.error).toBeNull()
  })

  it('an empty submit says empty', () => {
    const { hook } = setup()
    act(() => hook.result.current.openManual())
    act(() => void hook.result.current.submit())
    expect(hook.result.current.error).toBe('empty')
  })

  it('the failure goes away when the camera becomes ready (after a retry)', () => {
    const { hook } = setup('error')
    expect(hook.result.current.failure).not.toBeNull()
    hook.rerender({ status: 'ready' })
    expect(hook.result.current.failure).toBeNull()
  })
})
