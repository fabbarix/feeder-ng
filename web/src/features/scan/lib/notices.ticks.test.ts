// B9-54 (RES-03): a refused Tick is not a refused Scan. syncNotices(results, sent) reads each result by the kind of the Op it answers
// (`sent`, as FlushResult.sent lists them) and leaves Ticks to the Shop's own notices (shop/lib/tickNotices): the Scan wording
// ("Couldn't sync a Scan: …") never appears for a Tick, a merge note never for a Tick.
import { describe, expect, it } from 'vitest'
import type { Op, ScanResult } from '../types'
import { syncNotices } from './notices'

const op = (uuid: string, kind: Op['kind']): Op => ({ clientUuid: uuid, scannedAt: '2026-11-09T11:50:00Z', kind })
const refused = (uuid: string, message: string): ScanResult => ({ clientUuid: uuid, status: 'rejected', error: { code: 'not_on_list', message } })

describe('syncNotices with the sent Ops', () => {
  it('a refused shop_tick and a refused shop_untick make no Scan notice', () => {
    const sent = [op('t-1', 'shop_tick'), op('u-1', 'shop_untick')]
    expect(syncNotices([refused('t-1', 'Carrot is not on the list'), refused('u-1', 'gone')], sent)).toEqual([])
  })

  it('a refused Scan in the same batch still says so, once, in the Scan wording', () => {
    const sent = [op('t-1', 'shop_tick'), op('s-1', 'shop_scan')]
    const notices = syncNotices([refused('t-1', 'not on the list'), refused('s-1', 'That barcode now belongs to an archived Product.')], sent)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ kind: 'rejected', clientUuid: 's-1' })
    expect(notices[0]!.text).toContain("Couldn't sync a Scan")
  })

  it('without the sent Ops it reads every result as a Scan, as before (older callers)', () => {
    expect(syncNotices([refused('s-1', 'x')])).toHaveLength(1)
  })
})
