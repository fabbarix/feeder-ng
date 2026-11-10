import { describe, expect, it } from 'vitest'
import { archivedOwnerId } from './archivedProduct'
import type { ScanResult } from '../types'

const rejected = (code: string, message: string): ScanResult => ({ clientUuid: 'u', status: 'rejected', error: { code, message } })

describe('archivedOwnerId', () => {
  it('reads the owner from a barcode_archived rejection', () => {
    expect(archivedOwnerId(rejected('barcode_archived', 'barcode already belongs to product 9'))).toBe(9)
    expect(archivedOwnerId(rejected('barcode_archived', 'barcode already belongs to product 1204'))).toBe(1204)
  })

  it('is null for other rejections, other statuses, no result, or a message without an id', () => {
    expect(archivedOwnerId(rejected('validation_failed', 'barcode already belongs to product 9'))).toBeNull()
    expect(archivedOwnerId(rejected('barcode_archived', 'something else'))).toBeNull()
    expect(archivedOwnerId({ clientUuid: 'u', status: 'applied' })).toBeNull()
    expect(archivedOwnerId(null)).toBeNull()
  })
})
