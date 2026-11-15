// B9-54 (RES-03): a Tick waiting in the queue is an addition with `syncedAt: null` (the type said so since B9-23). Its ticked row says
// "Waiting to sync · 50 g to Stock" (compact "Waiting to sync", SSP-05's rule), muted, with Phosphor Clock (the glyph `duration`; no new glyph).
// The entry says `sync: 'pending'`, so the row can draw its clock badge and `data-sync`.
import { describe, expect, it } from 'vitest'
import { lineEntry, listEntries } from './lines'
import { rowMeta } from './rows'
import { tickedMeta } from './tickAmount'
import { makeAddition, makeGarlic, makeList, makeTick } from '../testData'

const waiting = (over = {}) => makeAddition({ clientUuid: 'w-1', quantity: 50, syncedAt: null, ...over })

describe('tickedMeta with a waiting addition', () => {
  it('"Waiting to sync · 50 g to Stock", compact "Waiting to sync", muted, Clock', () => {
    expect(tickedMeta(makeTick({ additions: [waiting()] }), 'g', 'metric')).toEqual({
      text: 'Waiting to sync · 50 g to Stock',
      compact: 'Waiting to sync',
      tone: 'muted',
      icon: 'duration',
    })
  })

  it('a Tick without adding says just "Waiting to sync" in both forms', () => {
    expect(tickedMeta(makeTick({ added: null, additions: [waiting({ quantity: null })] }), 'g', 'metric')).toEqual({
      text: 'Waiting to sync',
      compact: 'Waiting to sync',
      tone: 'muted',
      icon: 'duration',
    })
  })

  it('a waiting addition on a Line another shopper already ticked: waiting wins, and it names only this phone\'s amount', () => {
    const m = tickedMeta(makeTick({ additions: [makeAddition({ who: 'Sam', mine: false, quantity: 500 }), waiting()] }), 'g', 'metric')
    expect(m).toMatchObject({ text: 'Waiting to sync · 50 g to Stock', compact: 'Waiting to sync', tone: 'muted', icon: 'duration' })
  })

  it('synced additions are unchanged: nothing waiting means the usual meta', () => {
    expect(tickedMeta(makeTick(), 'g', 'metric')).toMatchObject({ text: '+500 g in Stock', tone: 'success', icon: 'stock' })
  })
})

describe('the entry of a waiting Tick', () => {
  const line = makeGarlic({ ticked: true, quantity: 0, tick: makeTick({ additions: [waiting()] }) })

  it('says sync: pending, and its row meta is the waiting meta (no success tone)', () => {
    const entry = lineEntry(line, 'USD', 'metric')
    expect(entry.sync).toBe('pending')
    expect(rowMeta(entry)).toMatchObject({ text: 'Waiting to sync · 50 g to Stock', compact: 'Waiting to sync', icon: 'duration' })
    expect(rowMeta(entry).status).toBeUndefined()
  })

  it('a synced ticked entry and an open one say nothing', () => {
    expect(lineEntry(makeGarlic({ ticked: true, quantity: 0, tick: makeTick() }), 'USD', 'metric').sync).toBeUndefined()
    expect(lineEntry(makeGarlic(), 'USD', 'metric').sync).toBeUndefined()
  })

  it('it sits in the Ticked group, with its tick', () => {
    const { ticked } = listEntries(makeList({ lines: [line] }), 'metric')
    expect(ticked).toHaveLength(1)
    expect(ticked[0]!.sync).toBe('pending')
  })
})
