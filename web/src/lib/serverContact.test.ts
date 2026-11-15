// B9-49 (RES-07): "the newest successful server answer", recorded by the HTTP client and kept on the device so a cold offline start can
// name it. Plain TypeScript (lib/serverContact.ts). localStorage key `feeder.contact` (an ISO string); never throws when storage is blocked.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTACT_KEY, lastServerContact, recordServerContact, resetServerContact, subscribeServerContact } from './serverContact'

beforeEach(() => {
  localStorage.clear()
  resetServerContact()
})

describe('serverContact', () => {
  it('is null until something is recorded', () => {
    expect(lastServerContact()).toBeNull()
  })

  it('records the moment of an answer and keeps only the newest', () => {
    recordServerContact(new Date('2026-11-10T14:30:00Z'))
    expect(lastServerContact()).toEqual(new Date('2026-11-10T14:30:00Z'))
    recordServerContact(new Date('2026-11-10T14:00:00Z')) // an older answer arriving late never moves it back
    expect(lastServerContact()).toEqual(new Date('2026-11-10T14:30:00Z'))
    recordServerContact(new Date('2026-11-10T15:00:00Z'))
    expect(lastServerContact()).toEqual(new Date('2026-11-10T15:00:00Z'))
  })

  it('defaults to now', () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T09:00:00Z') })
    try {
      recordServerContact()
      expect(lastServerContact()).toEqual(new Date('2026-11-10T09:00:00Z'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('is kept on the device: a fresh start reads it back, and a corrupt value reads as none', () => {
    recordServerContact(new Date('2026-11-10T14:30:00Z'))
    expect(localStorage.getItem(CONTACT_KEY)).toBe('2026-11-10T14:30:00.000Z')
    resetServerContact({ keepStored: true })
    expect(lastServerContact()).toEqual(new Date('2026-11-10T14:30:00Z'))
    localStorage.setItem(CONTACT_KEY, 'yesterday-ish')
    resetServerContact({ keepStored: true })
    expect(lastServerContact()).toBeNull()
  })

  it('tells a subscriber each newer moment, and stops after unsubscribe', () => {
    const seen: number[] = []
    const off = subscribeServerContact((d) => seen.push(d.getTime()))
    recordServerContact(new Date(1000))
    recordServerContact(new Date(500)) // older: no notification
    recordServerContact(new Date(2000))
    off()
    recordServerContact(new Date(3000))
    expect(seen).toEqual([1000, 2000])
  })

  it('never throws when storage is blocked: it is still known for this session', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => recordServerContact(new Date(1000))).not.toThrow()
    expect(lastServerContact()).toEqual(new Date(1000))
    vi.restoreAllMocks()
  })
})
