// Beta 7: "Read the receipt" stays shut while a photo is being edited (its sheet is open).
// Pinned API added to ./readGate: ReadGateInput gains `editing?: boolean` (default false): a photo is open in the editor sheet.
import { describe, expect, it } from 'vitest'
import { readGate, type ReadGateInput } from './readGate'

const base: ReadGateInput = { offline: false, avail: { loading: false, enabled: true, photos: true }, photoCount: 1, preparing: false, reading: false }

describe('readGate and editing', () => {
  it('is shut while a photo is being edited, and says nothing', () => {
    expect(readGate({ ...base, editing: true })).toEqual({ canRead: false, reasons: [] })
  })
  it('opens again when the edit is over, or when editing is not given', () => {
    expect(readGate({ ...base, editing: false }).canRead).toBe(true)
    expect(readGate(base).canRead).toBe(true)
  })
})
