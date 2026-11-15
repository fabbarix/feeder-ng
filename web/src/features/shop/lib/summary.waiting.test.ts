// B9-54 (RES-03): "The Shop metrics count the queued Tick ('18 of 20 left') and add '· 1 waiting' after 'ticked'". The list given to shopSummary
// already has the waiting Ticks applied (lib/pendingTicks applyPending), so `left` and `ticked` count them; the third argument says how many
// Ticks are waiting: the meta reads "2 ticked · 1 waiting · until Sun 15". Nothing waiting: the meta is as before.
import { describe, expect, it } from 'vitest'
import { makeLine, makeList } from '../testData'
import { shopSummary } from './summary'

const list = makeList({ lines: [makeLine(), makeLine({ ingredientId: 3 }), makeLine({ ingredientId: 4 })], progress: { ticked: 2, total: 3 } })

describe('shopSummary with waiting Ticks', () => {
  it('adds "· 1 waiting" after "ticked"', () => {
    const s = shopSummary(list, 'Coop', { waiting: 1 })
    expect(s.meta).toBe('2 ticked · 1 waiting · until Sun 15')
    expect(s.left).toBe(1)
    expect(s.ticked).toBe(2)
  })
  it('counts every waiting Tick', () => {
    expect(shopSummary(list, null, { waiting: 2 }).meta).toBe('2 ticked · 2 waiting · until Sun 15')
  })
  it('nothing waiting (0 or not given): unchanged', () => {
    expect(shopSummary(list, null).meta).toBe('2 ticked · until Sun 15')
    expect(shopSummary(list, null, { waiting: 0 }).meta).toBe('2 ticked · until Sun 15')
  })
})
