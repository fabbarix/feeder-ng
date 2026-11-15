// B9-31 (SAFE-01): AppUpdate is where the "new version" prompt learns that a form has unsaved changes. It reads the app-level flag
// (ui/lib/unsavedChanges.ts) and passes it to useAppUpdate as `hasUnsavedChanges`, which holds the prompt back (updateMove already does).
// useAppUpdate.ts and its move table are unchanged: only the source is new.
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppUpdate } from './AppUpdate'
import { resetUnsavedChanges, useReportUnsavedChanges } from '../ui/lib/unsavedChanges'
import { useAppUpdate } from './useAppUpdate'

vi.mock('./useAppUpdate', () => ({ useAppUpdate: vi.fn() }))

function Editor({ dirty }: { dirty: boolean }) {
  useReportUnsavedChanges(dirty)
  return null
}
const last = () => vi.mocked(useAppUpdate).mock.calls.at(-1)![0]

beforeEach(() => vi.mocked(useAppUpdate).mockReset())
afterEach(() => resetUnsavedChanges())

describe('AppUpdate and unsaved changes', () => {
  it('passes hasUnsavedChanges: false when no form is dirty', () => {
    render(<MemoryRouter><AppUpdate /></MemoryRouter>)
    expect(last()).toEqual(expect.objectContaining({ hasUnsavedChanges: false }))
  })

  it('passes hasUnsavedChanges: true while a form is dirty, and false again when it is clean or gone', () => {
    const tree = (dirty: boolean | null) => (
      <MemoryRouter>
        <AppUpdate />
        {dirty === null ? null : <Editor dirty={dirty} />}
      </MemoryRouter>
    )
    const r = render(tree(true))
    expect(last()).toEqual(expect.objectContaining({ hasUnsavedChanges: true }))
    r.rerender(tree(false))
    expect(last()).toEqual(expect.objectContaining({ hasUnsavedChanges: false }))
    r.rerender(tree(true))
    r.rerender(tree(null))
    expect(last()).toEqual(expect.objectContaining({ hasUnsavedChanges: false }))
  })

  it('keeps passing the waiting Scans and Ticks', () => {
    render(<MemoryRouter><AppUpdate statusHooks={[() => ({ pendingScans: 2 })]} /></MemoryRouter>)
    expect(last()).toEqual(expect.objectContaining({ pendingSyncCount: 2, hasUnsavedChanges: false }))
  })
})
