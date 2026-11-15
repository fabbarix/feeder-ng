// B9-31 (SAFE-01 "Connect the update prompt"): the app-level flag "a form has unsaved changes", in app/unsavedChanges.ts. A tiny
// external store (useSyncExternalStore) so the editor and the shell, which are not in one subtree, share it without a provider.
//
//   useReportUnsavedChanges(dirty: boolean): void   an editor calls it every render with its dirty state. While it is mounted AND dirty
//                                                   it counts as one holder; unmounting while dirty releases it.
//   useHasUnsavedChanges(): boolean                 true while any holder exists. AppUpdate reads it (AppUpdate.unsaved.test.tsx).
//   resetUnsavedChanges(): void                     forgets every holder (test helper).
// Two editors can report at once (a future page with two forms); the flag stays on until both are clean.
import { act, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { resetUnsavedChanges, useHasUnsavedChanges, useReportUnsavedChanges } from './unsavedChanges'

afterEach(() => resetUnsavedChanges())

function Reporter({ dirty }: { dirty: boolean }) {
  useReportUnsavedChanges(dirty)
  return null
}

describe('unsaved changes flag', () => {
  it('is off when nothing reports', () => {
    expect(renderHook(() => useHasUnsavedChanges()).result.current).toBe(false)
  })

  it('goes on while a mounted reporter is dirty and off when it turns clean', () => {
    const reader = renderHook(() => useHasUnsavedChanges())
    const r = render(<Reporter dirty={false} />)
    expect(reader.result.current).toBe(false)
    r.rerender(<Reporter dirty />)
    expect(reader.result.current).toBe(true)
    r.rerender(<Reporter dirty={false} />)
    expect(reader.result.current).toBe(false)
  })

  it('a reporter that unmounts while dirty releases the flag (the editor was left)', () => {
    const reader = renderHook(() => useHasUnsavedChanges())
    const r = render(<Reporter dirty />)
    expect(reader.result.current).toBe(true)
    r.unmount()
    expect(reader.result.current).toBe(false)
  })

  it('two reporters: the flag stays on until both are clean', () => {
    const reader = renderHook(() => useHasUnsavedChanges())
    const a = render(<Reporter dirty />)
    const b = render(<Reporter dirty />)
    a.rerender(<Reporter dirty={false} />)
    expect(reader.result.current).toBe(true)
    b.unmount()
    expect(reader.result.current).toBe(false)
  })

  it('a reader mounted later sees the current state at once', () => {
    render(<Reporter dirty />)
    expect(renderHook(() => useHasUnsavedChanges()).result.current).toBe(true)
  })

  it('resetUnsavedChanges forgets every holder', () => {
    const reader = renderHook(() => useHasUnsavedChanges())
    render(<Reporter dirty />)
    act(() => resetUnsavedChanges())
    expect(reader.result.current).toBe(false)
  })
})
