// B9-54 (developer): on the phone `syncedAt: null` means "waiting in the offline queue", but the server sends null for a Tick made online (it
// never waited; internal/shopping/httpapi). markSynced reads every addition the server sent as synced at its tick time, so an online Tick
// never shows "Waiting to sync"; applyPending applies it first.
import { describe, expect, it } from 'vitest'
import { makeAddition, makeExtra, makeGarlic, makeList, makeTick } from '../testData'
import { applyPending, markSynced } from './pendingTicks'

const online = makeAddition({ clientUuid: 'o-1', tickedAt: '2026-11-14T10:12:00Z', syncedAt: null })
const list = makeList({
  lines: [makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [online] }) })],
  extras: [makeExtra({ id: 3, ticked: true, tick: makeTick({ additions: [{ ...online, clientUuid: 'o-2' }] }) })],
})

describe('markSynced', () => {
  it('an online Tick the server sent with syncedAt null reads as synced at its tick time, on Lines and extras', () => {
    const out = markSynced(list)
    expect(out.lines[0]!.tick!.additions[0]!.syncedAt).toBe('2026-11-14T10:12:00Z')
    expect(out.extras[0]!.tick!.additions[0]!.syncedAt).toBe('2026-11-14T10:12:00Z')
    expect(list.lines[0]!.tick!.additions[0]!.syncedAt).toBeNull()
  })

  it('the same list when nothing needs it', () => {
    const synced = makeList({ lines: [makeGarlic({ ticked: true, quantity: 0, tick: makeTick() })] })
    expect(markSynced(synced)).toBe(synced)
  })

  it('applyPending applies it with or without waiting Ticks', () => {
    expect(applyPending(list, [], { who: 'Ana' }).lines[0]!.tick!.additions[0]!.syncedAt).not.toBeNull()
  })
})
