// PPX: what the User is told after a merge that gave its Picture to a Product, and when a queued Picture was given up.
import { describe, expect, it } from 'vitest'
import { scanStrings } from '../strings'
import type { ScanApplied, ScanResult } from '../types'
import { pictureNotices, syncNotices } from './notices'

const applied = (over: Partial<ScanApplied>): ScanApplied => ({
  ingredientId: 1, ingredientName: 'tinned tomatoes', baseUnit: 'g', productId: 50, productName: 'Tinned tomatoes 400 g', quantity: 400, lotId: 1,
  priceCents: null, onList: false, remaining: 0, ticked: false, productCreated: false, ...over,
})
const ok = (uuid: string, scan: Partial<ScanApplied>): ScanResult => ({ clientUuid: uuid, status: 'applied', scan: applied(scan) })

describe('syncNotices: merged with a Picture', () => {
  it('says the picture was added when the merge filled the Product', () => {
    const merged = { productId: 50, productName: 'Tinned tomatoes 400 g', pictureFilled: true }
    expect(syncNotices([ok('a', { merged })])).toEqual([{ kind: 'merged', clientUuid: 'a', text: scanStrings.mergedWithPicture('Tinned tomatoes 400 g') }])
    expect(scanStrings.mergedWithPicture('Tinned tomatoes 400 g')).toMatch(/picture was added/)
  })

  it('keeps the plain merge text when no picture was added', () => {
    const merged = { productId: 50, productName: 'Tinned tomatoes 400 g' }
    expect(syncNotices([ok('a', { merged })])[0]?.text).toBe(scanStrings.merged('Tinned tomatoes 400 g'))
  })
})

describe('pictureNotices', () => {
  it('has nothing to say when no Picture was given up', () => {
    expect(pictureNotices([])).toEqual([])
  })

  it.each(['too_large', 'unsupported', 'rejected', 'missing'] as const)('tells that the scan was added without its picture (%s)', (reason) => {
    expect(pictureNotices([{ clientUuid: 'q-1', productName: 'Tinned tomatoes 400 g', reason }])).toEqual([
      { kind: 'picture', clientUuid: 'q-1', text: scanStrings.pictureDropped('Tinned tomatoes 400 g', reason) },
    ])
    expect(scanStrings.pictureDropped('Tinned tomatoes 400 g', reason)).toMatch(/without one/)
  })

  it('keeps the order of the failures', () => {
    const out = pictureNotices([
      { clientUuid: 'a', productName: 'A', reason: 'too_large' },
      { clientUuid: 'b', productName: 'B', reason: 'missing' },
    ])
    expect(out.map((n) => n.clientUuid)).toEqual(['a', 'b'])
  })
})
