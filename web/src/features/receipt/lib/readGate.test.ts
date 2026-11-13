// RR4 review: the gate of "Read the receipt", moved out of the screen (design 3.2, 7.3).
import { describe, expect, it } from 'vitest'
import { footerAvailability, readGate, type ReadGateInput } from './readGate'

const base: ReadGateInput = { offline: false, avail: { loading: false, enabled: true, photos: true }, photoCount: 1, preparing: false, reading: false }
const gate = (over: Partial<ReadGateInput> = {}, avail: Partial<ReadGateInput['avail']> = {}) => readGate({ ...base, ...over, avail: { ...base.avail, ...avail } })

describe('readGate', () => {
  it('opens with a photo, online, the assistant on and able to read photos', () => {
    expect(gate()).toEqual({ canRead: true, reasons: [] })
  })
  it.each([
    ['no photo', { photoCount: 0 }],
    ['photos being prepared', { preparing: true }],
    ['a read running', { reading: true }],
  ])('stays shut with %s, and says nothing', (_name, over) => {
    expect(gate(over)).toEqual({ canRead: false, reasons: [] })
  })
  it('offline says it needs a connection', () => {
    expect(gate({ offline: true })).toEqual({ canRead: false, reasons: ['Reading the receipt needs a connection'] })
  })
  it('waits for the status, saying nothing yet', () => {
    expect(gate({}, { loading: true, enabled: false })).toEqual({ canRead: false, reasons: [] })
  })
  it("the assistant off gives the Recipe Assistant's reason", () => {
    expect(gate({}, { enabled: false, message: 'off' })).toEqual({ canRead: false, reasons: ['off'] })
  })
  it('a model that cannot read photos gives its message', () => {
    expect(gate({}, { photos: false, photosMessage: 'no photos' })).toEqual({ canRead: false, reasons: ['no photos'] })
  })
  it('the household limit says when to try again, once', () => {
    expect(gate({}, { limitMessage: 'later' })).toEqual({ canRead: false, reasons: ['later'] })
    expect(gate({}, { enabled: false, message: 'later', limitMessage: 'later' }).reasons).toEqual(['later'])
  })
})

describe('footerAvailability', () => {
  it('is available when the assistant reads photos', () => {
    expect(footerAvailability({ loading: false, photos: true, isAdmin: false })).toEqual({ assistantAvailable: true, isAdmin: false })
  })
  it('is unavailable without photos, and keeps the Admin flag for the muted row', () => {
    expect(footerAvailability({ loading: false, photos: false, isAdmin: true })).toEqual({ assistantAvailable: false, isAdmin: true })
  })
  it('shows nothing while the status loads, not even to an Admin', () => {
    expect(footerAvailability({ loading: true, photos: false, isAdmin: true })).toEqual({ assistantAvailable: false, isAdmin: false })
  })
})
